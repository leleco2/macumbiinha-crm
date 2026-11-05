-- Stock changes are atomic with order status changes inside SQLite.
-- Only the first confirmation deducts stock. Cancellation restores it once.
CREATE TRIGGER IF NOT EXISTS order_confirm_check_stock
 BEFORE UPDATE OF status ON orders
 WHEN OLD.status='novo' AND NEW.status='confirmado'
 BEGIN
  SELECT CASE WHEN EXISTS(
   SELECT 1 FROM order_items i JOIN products p ON p.id=i.product_id
   WHERE i.order_id=NEW.id AND p.quantity < (
    SELECT SUM(j.quantity) FROM order_items j WHERE j.order_id=NEW.id AND j.product_id=p.id
   )
  ) THEN RAISE(ABORT,'ESTOQUE_INSUFICIENTE') END;
  SELECT CASE WHEN (SELECT COUNT(*) FROM order_items WHERE order_id=NEW.id)=0
   THEN RAISE(ABORT,'PEDIDO_SEM_ITENS') END;
 END;
CREATE TRIGGER IF NOT EXISTS order_confirm_deduct
 AFTER UPDATE OF status ON orders
 WHEN OLD.status='novo' AND NEW.status='confirmado'
 BEGIN
  UPDATE products SET quantity=quantity-(
   SELECT SUM(i.quantity) FROM order_items i WHERE i.order_id=NEW.id AND i.product_id=products.id
  ), updated_at=datetime('now')
  WHERE id IN (SELECT product_id FROM order_items WHERE order_id=NEW.id);
  INSERT INTO inventory_movements(id,product_id,delta,reason,order_id)
   SELECT lower(hex(randomblob(16))),product_id,-SUM(quantity),'pedido_confirmado',NEW.id
   FROM order_items WHERE order_id=NEW.id GROUP BY product_id;
 END;
CREATE TRIGGER IF NOT EXISTS order_cancel_restore
 AFTER UPDATE OF status ON orders
 WHEN OLD.status IN ('confirmado','separando','enviado') AND NEW.status='cancelado'
 BEGIN
  UPDATE products SET quantity=quantity+(
   SELECT SUM(i.quantity) FROM order_items i WHERE i.order_id=NEW.id AND i.product_id=products.id
  ), updated_at=datetime('now')
  WHERE id IN (SELECT product_id FROM order_items WHERE order_id=NEW.id);
  INSERT INTO inventory_movements(id,product_id,delta,reason,order_id)
   SELECT lower(hex(randomblob(16))),product_id,SUM(quantity),'pedido_cancelado',NEW.id
   FROM order_items WHERE order_id=NEW.id GROUP BY product_id;
 END;
-- The finance ledger is created and updated in the same transaction as order status.
CREATE TRIGGER IF NOT EXISTS order_confirm_receivable
 AFTER UPDATE OF status ON orders
 WHEN OLD.status='novo' AND NEW.status='confirmado' AND NEW.total_cents>0
 BEGIN
  INSERT INTO financial_entries(id,type,category,title,amount_cents,status,method,order_id,notes)
  VALUES(lower(hex(randomblob(16))),'receita','vendas','Pedido '||NEW.order_number,NEW.total_cents,'pendente','outro',NEW.id,'Gerado automaticamente ao confirmar pedido');
 END;
CREATE TRIGGER IF NOT EXISTS order_cancel_receivable
 AFTER UPDATE OF status ON orders
 WHEN OLD.status IN ('confirmado','separando') AND NEW.status='cancelado'
 BEGIN
  UPDATE financial_entries SET status='cancelado'
  WHERE order_id=NEW.id AND category='vendas' AND status='pendente';
 END;

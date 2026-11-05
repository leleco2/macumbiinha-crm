"""SQLite integration tests for stock/finance triggers (D1 uses SQLite)."""
import sqlite3, pathlib, unittest
DIR=pathlib.Path(__file__).resolve().parents[1]

class StoreRules(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(':memory:')
        self.db.execute('PRAGMA foreign_keys=ON')
        for file in sorted((DIR/'migrations').glob('*.sql')):
            self.db.executescript(file.read_text())
        self.db.execute("INSERT INTO products(id,sku,name,quantity,retail_cents,wholesale_cents,min_quantity) VALUES ('p','P-01','Case de couro',5,2400,1900,2)")
        self.db.execute("INSERT INTO orders(id,order_number,total_cents) VALUES('o','MC-100',4800)")
        self.db.execute("INSERT INTO order_items(id,order_id,product_id,sku,name,quantity,unit_price_cents,line_total_cents) VALUES('i','o','p','P-01','Case de couro',2,2400,4800)")
    def test_confirmation_moves_stock_and_creates_receivable(self):
        self.db.execute("UPDATE orders SET status='confirmado' WHERE id='o'")
        self.assertEqual(self.db.execute("SELECT quantity FROM products WHERE id='p'").fetchone()[0],3)
        self.assertEqual(self.db.execute("SELECT amount_cents FROM financial_entries WHERE order_id='o'").fetchone()[0],4800)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM inventory_movements WHERE order_id='o'").fetchone()[0],1)
    def test_cancel_restores_stock_once(self):
        self.db.execute("UPDATE orders SET status='confirmado' WHERE id='o'")
        self.db.execute("UPDATE orders SET status='cancelado' WHERE id='o'")
        self.assertEqual(self.db.execute("SELECT quantity FROM products WHERE id='p'").fetchone()[0],5)
        self.assertEqual(self.db.execute("SELECT status FROM financial_entries WHERE order_id='o'").fetchone()[0],'cancelado')
    def test_insufficient_stock_is_atomic(self):
        self.db.execute('UPDATE products SET quantity=1 WHERE id=\'p\'')
        with self.assertRaises(sqlite3.IntegrityError):self.db.execute("UPDATE orders SET status='confirmado' WHERE id='o'")
        self.assertEqual(self.db.execute("SELECT quantity FROM products WHERE id='p'").fetchone()[0],1)
        self.assertEqual(self.db.execute("SELECT status FROM orders WHERE id='o'").fetchone()[0],'novo')
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM financial_entries WHERE order_id='o'").fetchone()[0],0)
    def test_duplicate_lines_do_not_oversell(self):
        self.db.execute("INSERT INTO order_items(id,order_id,product_id,sku,name,quantity,unit_price_cents,line_total_cents) VALUES('j','o','p','P-01','Case de couro',4,2400,9600)")
        with self.assertRaises(sqlite3.IntegrityError):self.db.execute("UPDATE orders SET status='confirmado' WHERE id='o'")
        self.assertEqual(self.db.execute("SELECT quantity FROM products WHERE id='p'").fetchone()[0],5)

    def test_variation_order_uses_exact_sku_and_restores_stock(self):
        self.db.execute("INSERT INTO products(id,sku,name,quantity,retail_cents) VALUES ('v','P-01-KS','Case de couro - King Size',12,2600)")
        self.db.execute("INSERT INTO product_variants(variant_product_id,parent_product_id,label,position) VALUES('v','p','King Size',0)")
        self.db.execute("INSERT INTO orders(id,order_number,total_cents) VALUES('o2','MC-VAR-01',5200)")
        self.db.execute("INSERT INTO order_items(id,order_id,product_id,sku,name,quantity,unit_price_cents,line_total_cents) VALUES('v1','o2','v','P-01-KS','King Size',2,2600,5200)")
        self.db.execute("UPDATE orders SET status='confirmado' WHERE id='o2'")
        self.assertEqual(self.db.execute("SELECT quantity FROM products WHERE id='v'").fetchone()[0],10)
        self.assertEqual(self.db.execute("SELECT quantity FROM products WHERE id='p'").fetchone()[0],5)
        self.db.execute("UPDATE orders SET status='cancelado' WHERE id='o2'")
        self.assertEqual(self.db.execute("SELECT quantity FROM products WHERE id='v'").fetchone()[0],12)
    def test_variant_photos_are_separate_from_main_product(self):
        self.db.execute("INSERT INTO products(id,sku,name,quantity) VALUES('v2','P-01-SLIM','Case Slim',1)")
        self.db.execute("INSERT INTO product_variants(variant_product_id,parent_product_id,label) VALUES('v2','p','Slim')")
        self.db.execute("INSERT INTO product_gallery(id,product_id,file_name,mime_type,file_size,body) VALUES('img1','v2','foto.webp','image/webp',12,zeroblob(12))")
        self.assertEqual(self.db.execute("SELECT product_id FROM product_gallery WHERE id='img1'").fetchone()[0],'v2')

if __name__=='__main__':unittest.main()

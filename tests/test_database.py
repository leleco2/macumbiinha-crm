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

if __name__=='__main__':unittest.main()

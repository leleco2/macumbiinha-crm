PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
 id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_salt TEXT NOT NULL,
 password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'admin' CHECK(role IN ('admin','operador')),
 created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS login_limits (id TEXT PRIMARY KEY, attempts INTEGER NOT NULL DEFAULT 0, first_attempt INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS contacts (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '',
 segment TEXT NOT NULL DEFAULT 'varejo' CHECK(segment IN ('varejo','atacado')),
 status TEXT NOT NULL DEFAULT 'lead' CHECK(status IN ('lead','cliente')),
 origin TEXT NOT NULL DEFAULT 'manual' CHECK(origin IN ('manual','site','whatsapp')),
 notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')),
 updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_contacts_updated ON contacts(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone);
CREATE TABLE IF NOT EXISTS suppliers (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '',
 notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS products (
 id TEXT PRIMARY KEY, sku TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
 category TEXT NOT NULL DEFAULT 'geral', description TEXT NOT NULL DEFAULT '',
 cost_cents INTEGER NOT NULL DEFAULT 0 CHECK(cost_cents>=0),
 retail_cents INTEGER NOT NULL DEFAULT 0 CHECK(retail_cents>=0),
 wholesale_cents INTEGER NOT NULL DEFAULT 0 CHECK(wholesale_cents>=0),
 quantity INTEGER NOT NULL DEFAULT 0 CHECK(quantity>=0), min_quantity INTEGER NOT NULL DEFAULT 5 CHECK(min_quantity>=0),
 supplier_id TEXT REFERENCES suppliers(id) ON DELETE SET NULL,
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
 created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_products_low ON products(active,quantity,min_quantity);
CREATE TABLE IF NOT EXISTS inventory_movements (
 id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
 delta INTEGER NOT NULL, reason TEXT NOT NULL, order_id TEXT,
 created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_inventory_product ON inventory_movements(product_id,created_at DESC);
CREATE TABLE IF NOT EXISTS orders (
 id TEXT PRIMARY KEY, order_number TEXT UNIQUE NOT NULL,
 contact_id TEXT REFERENCES contacts(id) ON DELETE SET NULL,
 segment TEXT NOT NULL DEFAULT 'varejo' CHECK(segment IN ('varejo','atacado')),
 status TEXT NOT NULL DEFAULT 'novo' CHECK(status IN ('novo','confirmado','separando','enviado','concluido','cancelado')),
 payment_status TEXT NOT NULL DEFAULT 'pendente' CHECK(payment_status IN ('pendente','pago','estornado')),
 origin TEXT NOT NULL DEFAULT 'manual' CHECK(origin IN ('manual','site','whatsapp')),
 shipping_cents INTEGER NOT NULL DEFAULT 0 CHECK(shipping_cents>=0),
 discount_cents INTEGER NOT NULL DEFAULT 0 CHECK(discount_cents>=0),
 total_cents INTEGER NOT NULL DEFAULT 0 CHECK(total_cents>=0),
 notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')),
 updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status,created_at DESC);
CREATE TABLE IF NOT EXISTS order_items (
 id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
 product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
 sku TEXT NOT NULL, name TEXT NOT NULL, quantity INTEGER NOT NULL CHECK(quantity>0),
 unit_price_cents INTEGER NOT NULL CHECK(unit_price_cents>=0), line_total_cents INTEGER NOT NULL CHECK(line_total_cents>=0)
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE TABLE IF NOT EXISTS deals (
 id TEXT PRIMARY KEY, contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
 title TEXT NOT NULL, amount_cents INTEGER NOT NULL DEFAULT 0 CHECK(amount_cents>=0),
 stage TEXT NOT NULL DEFAULT 'novo' CHECK(stage IN ('novo','contato','negociacao','ganho','perdido')),
 origin TEXT NOT NULL DEFAULT 'manual' CHECK(origin IN ('manual','site','whatsapp')),
 notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')),
 updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_deals_stage ON deals(stage,updated_at DESC);
CREATE TABLE IF NOT EXISTS tasks (
 id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', due_date TEXT,
 contact_id TEXT REFERENCES contacts(id) ON DELETE SET NULL,
 deal_id TEXT REFERENCES deals(id) ON DELETE SET NULL,
 completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0,1)),
 created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(completed,due_date);
CREATE TABLE IF NOT EXISTS financial_entries (
 id TEXT PRIMARY KEY, type TEXT NOT NULL CHECK(type IN ('receita','despesa')),
 category TEXT NOT NULL DEFAULT 'outros', title TEXT NOT NULL,
 amount_cents INTEGER NOT NULL CHECK(amount_cents>0),
 due_date TEXT, paid_at TEXT,
 status TEXT NOT NULL DEFAULT 'pendente' CHECK(status IN ('pendente','pago','cancelado')),
 method TEXT NOT NULL DEFAULT 'outro', order_id TEXT REFERENCES orders(id) ON DELETE SET NULL,
 supplier_id TEXT REFERENCES suppliers(id) ON DELETE SET NULL,
 notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_financial_due ON financial_entries(status,due_date);
CREATE INDEX IF NOT EXISTS idx_financial_type ON financial_entries(type,created_at DESC);
CREATE TABLE IF NOT EXISTS activities (
 id TEXT PRIMARY KEY, contact_id TEXT REFERENCES contacts(id) ON DELETE SET NULL,
 order_id TEXT REFERENCES orders(id) ON DELETE SET NULL,
 user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
 kind TEXT NOT NULL, summary TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_activities_created ON activities(created_at DESC);
CREATE TABLE IF NOT EXISTS alerts (
 id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('pedido','estoque','venda','sistema')),
 title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', ref_id TEXT,
 read_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_alerts_unread ON alerts(read_at,created_at DESC);
CREATE TABLE IF NOT EXISTS public_form_limits (id TEXT PRIMARY KEY, count INTEGER NOT NULL DEFAULT 0, started_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS integration_events (event_id TEXT PRIMARY KEY, contact_id TEXT REFERENCES contacts(id) ON DELETE SET NULL,order_id TEXT REFERENCES orders(id) ON DELETE SET NULL,created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS audit_events (id TEXT PRIMARY KEY, actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,action TEXT NOT NULL,target_id TEXT,created_at TEXT NOT NULL DEFAULT (datetime('now')));

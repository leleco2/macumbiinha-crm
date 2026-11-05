-- Additive staff access policy: existing users, passwords and sessions remain intact.
-- Keep legacy users.role CHECK(admin,operador) for backwards compatibility.
CREATE TABLE IF NOT EXISTS user_access (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 display_name TEXT NOT NULL DEFAULT '',
 role_key TEXT NOT NULL DEFAULT 'vendas'
 CHECK(role_key IN ('administrador','gerente','financeiro','estoque','vendas','atendimento','consulta')),
 permissions_json TEXT,
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
 updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_user_access_role ON user_access(role_key,active);
-- Existing administrators keep full access. Legacy operators receive the sales role.
INSERT OR IGNORE INTO user_access(user_id,display_name,role_key,active)
 SELECT id,substr(email,1,instr(email,'@')-1),
 CASE WHEN role='admin' THEN 'administrador' ELSE 'vendas' END,1 FROM users;

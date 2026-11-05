-- Additional product choices are separate inventory SKUs linked to one storefront product.
-- Orders referencing the variation SKU continue using the existing atomic stock triggers.
CREATE TABLE IF NOT EXISTS product_variants (
 variant_product_id TEXT PRIMARY KEY REFERENCES products(id) ON DELETE RESTRICT,
 parent_product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
 label TEXT NOT NULL CHECK(length(label) BETWEEN 1 AND 100),
 position INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL DEFAULT (datetime('now')),
 UNIQUE(parent_product_id,label),
 CHECK(variant_product_id<>parent_product_id)
);
CREATE INDEX IF NOT EXISTS idx_variants_parent ON product_variants(parent_product_id,position,label);
-- Photos: additional upload images are private records, served only for published products.
-- Existing product_media is retained as the legacy cover image.
CREATE TABLE IF NOT EXISTS product_gallery (
 id TEXT PRIMARY KEY,
 product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
 file_name TEXT NOT NULL,
 mime_type TEXT NOT NULL CHECK(mime_type IN ('image/png','image/jpeg','image/webp')),
 file_size INTEGER NOT NULL CHECK(file_size BETWEEN 1 AND 850000),
 sort_order INTEGER NOT NULL DEFAULT 0,
 body BLOB NOT NULL,
 created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_product_gallery ON product_gallery(product_id,sort_order,created_at);

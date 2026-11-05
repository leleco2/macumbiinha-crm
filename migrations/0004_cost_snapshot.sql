-- Snapshots the product's cost at the time of the order for gross-margin reporting.
ALTER TABLE order_items ADD COLUMN unit_cost_cents INTEGER NOT NULL DEFAULT 0 CHECK(unit_cost_cents>=0);

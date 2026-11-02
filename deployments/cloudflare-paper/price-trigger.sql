-- Additive paper-only price-trigger fields. Existing orders and fills remain unchanged.
ALTER TABLE orders ADD COLUMN trigger_condition TEXT;
ALTER TABLE orders ADD COLUMN trigger_price_paise INTEGER;
ALTER TABLE orders ADD COLUMN expires_ms INTEGER;
CREATE INDEX IF NOT EXISTS idx_orders_trigger_watch ON orders(status,kind,due_ms,expires_ms);

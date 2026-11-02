-- Additive identity provenance for future 09:40 receipts. Existing rows stay null.
ALTER TABLE entry_snapshots ADD COLUMN instrument_key TEXT;

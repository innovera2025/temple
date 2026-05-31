-- Defense-in-depth for the inventory stock invariants: the database is the last
-- line of defense even if application code is ever bypassed. (App code already
-- rejects oversell/negative and caps the balance; these are DB backstops,
-- matching the foundation's CHECK style on amount_satang / byte_size.)

ALTER TABLE inventory_items
  ADD CONSTRAINT inventory_items_quantity_nonneg CHECK (quantity >= 0);

ALTER TABLE inventory_movements
  ADD CONSTRAINT inventory_movements_balance_after_nonneg CHECK (balance_after >= 0),
  ADD CONSTRAINT inventory_movements_quantity_positive CHECK (quantity > 0);

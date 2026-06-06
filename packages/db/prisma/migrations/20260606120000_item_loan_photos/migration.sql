-- Multiple borrow photos: store all attachment ids taken at borrow time as a JSON
-- array. The existing singular borrow_photo_id is kept as the first/primary photo
-- for back-compat. Nullable + additive => no RLS change (row policies still apply).
ALTER TABLE "item_loans" ADD COLUMN IF NOT EXISTS "borrow_photo_ids" jsonb;

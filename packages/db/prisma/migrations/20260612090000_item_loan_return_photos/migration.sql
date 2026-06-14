-- Return photos: store attachment ids photographed when the borrower brings
-- items back. Additive nullable column; existing RLS policies still apply.
ALTER TABLE "item_loans" ADD COLUMN IF NOT EXISTS "return_photo_ids" jsonb;

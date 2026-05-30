-- Task 4: extend the donor registry with CRM fields.
-- Table-level grants on `donors` already cover new columns, and RLS is row-based
-- (tenant_id), so no new grants or policies are required.

ALTER TABLE donors
  ADD COLUMN legal_name text,
  ADD COLUMN line_id text,
  ADD COLUMN notes text,
  ADD COLUMN tags text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN consent boolean NOT NULL DEFAULT false;

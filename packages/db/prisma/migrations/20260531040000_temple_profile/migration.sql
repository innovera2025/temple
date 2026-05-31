-- Temple profile / master data: editable temple fields used on documents
-- (receipts/reports) and as reference data. All nullable so existing temples are
-- unaffected. temples already has the wat_migrate grant (foundation ON ALL TABLES)
-- and the platform plane reads/writes it via withSystemAccess; the tenant temple
-- module also uses withSystemAccess scoped to id = tenantId. No RLS/grant change.

ALTER TABLE temples
  ADD COLUMN address_th text,
  ADD COLUMN subdistrict text,
  ADD COLUMN district text,
  ADD COLUMN province text,
  ADD COLUMN postal_code text,
  ADD COLUMN phone text,
  ADD COLUMN email text,
  ADD COLUMN line_id text,
  ADD COLUMN website_url text,
  ADD COLUMN abbot_name text,
  ADD COLUMN registration_no text,
  ADD COLUMN tax_id text,
  ADD COLUMN denomination text,
  ADD COLUMN logo_url text,
  ADD COLUMN receipt_header_th text,
  ADD COLUMN receipt_footer_th text;

-- Attachment file bytes stored in the DB (chosen backend: self-contained, no
-- external object store). bytea is TOASTed (stored out-of-line) so listing
-- attachment metadata never reads the blob unless `data` is explicitly selected.
-- The attachments table is empty (no upload pipeline existed), so NOT NULL is safe.
-- No RLS/grant change: attachments is already a tenant RLS table with wat_app
-- SELECT/INSERT/UPDATE/DELETE grants.

ALTER TABLE attachments ADD COLUMN data bytea NOT NULL;

CREATE INDEX attachments_tenant_owner_idx ON attachments(tenant_id, owner_type, owner_id);

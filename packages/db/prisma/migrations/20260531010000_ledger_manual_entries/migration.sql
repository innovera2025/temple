-- Task 7: manual ledger income/expense entries.
--
-- Additive only. The new `payee` column on a manual expense entry is covered by
-- the existing row-level RLS (tenant_id) on ledger_entries, the table-wide
-- INSERT/UPDATE grant to wat_app already covers it, and DELETE stays revoked
-- from wat_app on ledger_entries — so the no-hard-delete rule still holds
-- (manual entries are voided to status 'voided', never deleted).
--
-- Manual entries and donation auto-posted income share the SAME doc counter
-- (doc_type = 'ledger_entry', prefix 'LEDG-'), so entry numbers stay one
-- monotonic per-tenant sequence and can never collide on (tenant_id, entry_no).

ALTER TABLE ledger_entries
  ADD COLUMN payee text;

-- Range scans for the monthly summary / date-filtered ledger list.
CREATE INDEX ledger_entries_tenant_id_entry_date_idx
  ON ledger_entries(tenant_id, entry_date);

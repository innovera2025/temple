-- Attachments are evidence files (not financial records), and the foundation
-- already GRANTs DELETE on attachments to wat_app — but it created only
-- select/insert/update RLS policies, so a wat_app DELETE was blocked by FORCE
-- RLS. Add the matching tenant-scoped DELETE policy so an admin/finance/staff can
-- remove a wrongly-uploaded file (the action is audited). Other tenant tables
-- intentionally keep no DELETE policy (no-hard-delete for financial data).

CREATE POLICY attachments_tenant_delete
  ON attachments
  FOR DELETE TO wat_app
  USING (tenant_id = current_tenant_id());

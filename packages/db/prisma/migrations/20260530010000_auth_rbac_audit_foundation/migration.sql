ALTER TABLE users
  ADD COLUMN password_hash text;

CREATE UNIQUE INDEX users_email_key ON users(email);

ALTER TABLE audit_logs
  ADD COLUMN before jsonb,
  ADD COLUMN after jsonb,
  ADD COLUMN reason text,
  ADD COLUMN ip text;

CREATE TABLE auth_refresh_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES temples(id),
  user_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  replaced_by_token_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, user_id) REFERENCES users(tenant_id, id),
  FOREIGN KEY (tenant_id, replaced_by_token_id) REFERENCES auth_refresh_tokens(tenant_id, id)
);

CREATE INDEX auth_refresh_tokens_tenant_id_idx ON auth_refresh_tokens(tenant_id);
CREATE INDEX auth_refresh_tokens_tenant_user_id_idx ON auth_refresh_tokens(tenant_id, user_id);

ALTER TABLE auth_refresh_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_refresh_tokens FORCE ROW LEVEL SECURITY;

CREATE POLICY auth_refresh_tokens_migrate_all
  ON auth_refresh_tokens
  FOR ALL TO wat_migrate
  USING (true)
  WITH CHECK (true);

CREATE POLICY auth_refresh_tokens_tenant_select
  ON auth_refresh_tokens
  FOR SELECT TO wat_app
  USING (tenant_id = current_tenant_id());

CREATE POLICY auth_refresh_tokens_tenant_insert
  ON auth_refresh_tokens
  FOR INSERT TO wat_app
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY auth_refresh_tokens_tenant_update
  ON auth_refresh_tokens
  FOR UPDATE TO wat_app
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON auth_refresh_tokens TO wat_migrate;
GRANT SELECT, INSERT, UPDATE ON auth_refresh_tokens TO wat_app;
REVOKE DELETE ON auth_refresh_tokens FROM wat_app;

-- Devotee (ญาติโยม) self-service identity: a tenant-INDEPENDENT account plane,
-- mirroring the platform tables. These two tables have NO RLS and are reached only
-- via the wat_migrate role (withSystemAccess), exactly like platform_users.

CREATE TABLE devotee_accounts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL UNIQUE,
  display_name  text NOT NULL,
  password_hash text,
  phone         text,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz(6) NOT NULL DEFAULT now(),
  updated_at    timestamptz(6) NOT NULL DEFAULT now()
);

CREATE TABLE devotee_refresh_tokens (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  devotee_account_id   uuid NOT NULL REFERENCES devotee_accounts(id),
  token_hash           text NOT NULL UNIQUE,
  expires_at           timestamptz(6) NOT NULL,
  revoked_at           timestamptz(6),
  replaced_by_token_id uuid REFERENCES devotee_refresh_tokens(id),
  created_at           timestamptz(6) NOT NULL DEFAULT now()
);
CREATE INDEX devotee_refresh_tokens_devotee_account_id_idx ON devotee_refresh_tokens(devotee_account_id);

-- Link a temple's Donor CRM record to the devotee who owns it. NULL for staff-created
-- donors; unique per (tenant, devotee) so a devotee maps to exactly one donor per temple.
-- (Postgres treats NULLs as distinct, so many staff donors with NULL are allowed.)
ALTER TABLE donors ADD COLUMN devotee_account_id uuid REFERENCES devotee_accounts(id);
CREATE UNIQUE INDEX donors_tenant_devotee_uniq ON donors(tenant_id, devotee_account_id);

-- Audit actor can be a devotee (not a tenant user). The composite FK
-- (tenant_id, actor_user_id) -> users is unaffected: actor_user_id stays NULL for
-- devotee actions (MATCH SIMPLE skips the FK when a column is NULL).
ALTER TABLE audit_logs ADD COLUMN actor_type text NOT NULL DEFAULT 'user';
ALTER TABLE audit_logs ADD COLUMN actor_devotee_account_id uuid;

-- Devotee tables are migrate-only (no wat_app grant, no RLS) — same posture as the
-- platform tables. wat_app already holds INSERT/UPDATE on donors + audit_logs, which
-- covers the new columns; FK validation needs no extra grant on devotee_accounts.
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON devotee_accounts, devotee_refresh_tokens TO wat_migrate;

-- Task 11 — Minimal Innovera platform admin plane.
-- Adds platform-user authentication fields, a platform refresh-token table, and
-- break-glass grants. Platform tables stay OUT of RLS (they have no tenant_id);
-- only the migrate role may touch them, so the platform plane accesses them via
-- withSystemAccess. The foundation `GRANT ... ON ALL TABLES` only covered tables
-- that existed then, so the two NEW tables need explicit grants.

CREATE TYPE platform_role AS ENUM ('super_admin', 'support');

ALTER TABLE platform_users
  ADD COLUMN password_hash text,
  ADD COLUMN platform_role platform_role NOT NULL DEFAULT 'support',
  ADD COLUMN is_active boolean NOT NULL DEFAULT true;

-- created_temple_id links an approved application to the temple it created.
-- ON DELETE SET NULL preserves application history if a temple row is ever removed.
-- NOTE: this FK also makes temple_applications part of `TRUNCATE temples ... CASCADE`
-- (used only by the RLS test harness) — acceptable, applications are not reset data.
ALTER TABLE temple_applications
  ADD COLUMN reviewed_at timestamptz,
  ADD COLUMN rejection_reason text,
  ADD COLUMN created_temple_id uuid REFERENCES temples(id) ON DELETE SET NULL;

CREATE TABLE platform_refresh_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_user_id uuid NOT NULL REFERENCES platform_users(id),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  replaced_by_token_id uuid REFERENCES platform_refresh_tokens(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX platform_refresh_tokens_platform_user_id_idx ON platform_refresh_tokens(platform_user_id);

CREATE TABLE break_glass_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_user_id uuid NOT NULL REFERENCES platform_users(id),
  tenant_id uuid NOT NULL REFERENCES temples(id),
  reason text NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX break_glass_grants_platform_user_id_idx ON break_glass_grants(platform_user_id);
CREATE INDEX break_glass_grants_tenant_id_idx ON break_glass_grants(tenant_id);

-- Platform tables are accessed only by the migrate role (no RLS, no wat_app grant).
-- TRUNCATE is included so a `TRUNCATE temples ... CASCADE` (used by the RLS test
-- harness) can cascade through the temples FK on break_glass_grants.
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON platform_refresh_tokens TO wat_migrate;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON break_glass_grants TO wat_migrate;

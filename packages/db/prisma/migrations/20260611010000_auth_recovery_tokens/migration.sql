-- Account recovery + devotee email verification.
--
-- auth_action_tokens: single-use tokens (sha256 hash only — the raw token
-- lives only in the email link). Plane-agnostic: exactly ONE of user_id /
-- devotee_account_id is set. Platform-plane recovery stays platform-assisted
-- (no tokens). The table has NO tenant_id (a reset starts from an email,
-- before any tenant context exists) and is granted ONLY to wat_migrate —
-- wat_app has no path to it.

ALTER TABLE devotee_accounts ADD COLUMN email_verified_at timestamptz;

CREATE TABLE auth_action_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purpose text NOT NULL CHECK (purpose IN ('password_reset', 'email_verify')),
  token_hash text NOT NULL UNIQUE,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  devotee_account_id uuid REFERENCES devotee_accounts(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(user_id, devotee_account_id) = 1)
);

CREATE INDEX auth_action_tokens_user_id_idx ON auth_action_tokens(user_id);
CREATE INDEX auth_action_tokens_devotee_account_id_idx ON auth_action_tokens(devotee_account_id);

GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON auth_action_tokens TO wat_migrate;

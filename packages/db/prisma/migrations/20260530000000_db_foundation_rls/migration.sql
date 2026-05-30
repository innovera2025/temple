CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wat_migrate') THEN
    CREATE ROLE wat_migrate LOGIN PASSWORD 'wat_migrate_password' NOBYPASSRLS;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wat_app') THEN
    CREATE ROLE wat_app LOGIN PASSWORD 'wat_app_password' NOBYPASSRLS;
  END IF;
END
$$;

GRANT wat_migrate TO CURRENT_USER;

CREATE OR REPLACE FUNCTION current_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid
$$;

CREATE TYPE temple_status AS ENUM ('active', 'suspended', 'archived');
CREATE TYPE application_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE tenant_role AS ENUM ('admin', 'finance', 'staff');
CREATE TYPE donor_type AS ENUM ('person', 'organization');
CREATE TYPE donation_status AS ENUM ('pledged', 'confirmed', 'cancelled');
CREATE TYPE receipt_status AS ENUM ('issued', 'voided');
CREATE TYPE ledger_entry_status AS ENUM ('draft', 'posted', 'voided');
CREATE TYPE ledger_account_type AS ENUM ('asset', 'liability', 'equity', 'revenue', 'expense');
CREATE TYPE attachment_owner_type AS ENUM ('donation', 'receipt', 'ledger_entry', 'donor');

CREATE TABLE temples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name_th text NOT NULL,
  name_en text,
  status temple_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE platform_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  display_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE temple_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  temple_name_th text NOT NULL,
  contact_email text NOT NULL,
  status application_status NOT NULL DEFAULT 'pending',
  reviewed_by_platform_user_id uuid REFERENCES platform_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE platform_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_platform_user_id uuid REFERENCES platform_users(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES temples(id),
  email text NOT NULL,
  display_name text NOT NULL,
  role tenant_role NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, email),
  UNIQUE (tenant_id, id)
);

CREATE TABLE donors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES temples(id),
  display_name text NOT NULL,
  donor_type donor_type NOT NULL DEFAULT 'person',
  email text,
  phone text,
  address text,
  tax_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id)
);

CREATE TABLE donations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES temples(id),
  donor_id uuid,
  amount_satang bigint NOT NULL CHECK (amount_satang > 0),
  currency char(3) NOT NULL DEFAULT 'THB',
  donation_date date NOT NULL,
  status donation_status NOT NULL DEFAULT 'confirmed',
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, donor_id) REFERENCES donors(tenant_id, id)
);

CREATE TABLE receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES temples(id),
  donation_id uuid NOT NULL,
  receipt_no text NOT NULL,
  status receipt_status NOT NULL DEFAULT 'issued',
  issued_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, receipt_no),
  FOREIGN KEY (tenant_id, donation_id) REFERENCES donations(tenant_id, id)
);

CREATE TABLE ledger_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES temples(id),
  code text NOT NULL,
  name_th text NOT NULL,
  account_type ledger_account_type NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code),
  UNIQUE (tenant_id, id)
);

CREATE TABLE ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES temples(id),
  entry_no text NOT NULL,
  account_id uuid NOT NULL,
  amount_satang bigint NOT NULL,
  entry_date date NOT NULL,
  status ledger_entry_status NOT NULL DEFAULT 'posted',
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, entry_no),
  FOREIGN KEY (tenant_id, account_id) REFERENCES ledger_accounts(tenant_id, id)
);

CREATE TABLE reconciliation_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES temples(id),
  period_start date NOT NULL,
  period_end date NOT NULL,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, period_start, period_end)
);

CREATE TABLE doc_counters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES temples(id),
  doc_type text NOT NULL,
  next_value bigint NOT NULL DEFAULT 1 CHECK (next_value > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, doc_type)
);

CREATE TABLE attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES temples(id),
  owner_type attachment_owner_type NOT NULL,
  owner_id uuid NOT NULL,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  storage_key text NOT NULL,
  byte_size bigint NOT NULL CHECK (byte_size >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES temples(id),
  actor_user_id uuid,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, actor_user_id) REFERENCES users(tenant_id, id)
);

CREATE INDEX users_tenant_id_idx ON users(tenant_id);
CREATE INDEX donors_tenant_id_idx ON donors(tenant_id);
CREATE INDEX donations_tenant_id_idx ON donations(tenant_id);
CREATE INDEX receipts_tenant_id_idx ON receipts(tenant_id);
CREATE INDEX ledger_accounts_tenant_id_idx ON ledger_accounts(tenant_id);
CREATE INDEX ledger_entries_tenant_id_idx ON ledger_entries(tenant_id);
CREATE INDEX reconciliation_periods_tenant_id_idx ON reconciliation_periods(tenant_id);
CREATE INDEX doc_counters_tenant_id_idx ON doc_counters(tenant_id);
CREATE INDEX attachments_tenant_id_idx ON attachments(tenant_id);
CREATE INDEX audit_logs_tenant_id_idx ON audit_logs(tenant_id);

DO $$
DECLARE
  tenant_table text;
BEGIN
  FOREACH tenant_table IN ARRAY ARRAY[
    'users',
    'donors',
    'donations',
    'receipts',
    'ledger_accounts',
    'ledger_entries',
    'reconciliation_periods',
    'doc_counters',
    'attachments',
    'audit_logs'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tenant_table);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tenant_table);
    EXECUTE format('CREATE POLICY %I ON %I FOR ALL TO wat_migrate USING (true) WITH CHECK (true)', tenant_table || '_migrate_all', tenant_table);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO wat_app USING (tenant_id = current_tenant_id())', tenant_table || '_tenant_select', tenant_table);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT TO wat_app WITH CHECK (tenant_id = current_tenant_id())', tenant_table || '_tenant_insert', tenant_table);
    EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE TO wat_app USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id())', tenant_table || '_tenant_update', tenant_table);
  END LOOP;
END
$$;

GRANT USAGE ON SCHEMA public TO wat_app, wat_migrate;
GRANT EXECUTE ON FUNCTION current_tenant_id() TO wat_app, wat_migrate;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public TO wat_migrate;
GRANT SELECT, INSERT, UPDATE ON users, donors, donations, receipts, ledger_accounts, ledger_entries, reconciliation_periods, doc_counters, attachments, audit_logs TO wat_app;
GRANT DELETE ON users, donors, ledger_accounts, reconciliation_periods, attachments TO wat_app;

REVOKE DELETE ON donations, receipts, ledger_entries, doc_counters FROM wat_app;
REVOKE UPDATE, DELETE ON audit_logs FROM wat_app;

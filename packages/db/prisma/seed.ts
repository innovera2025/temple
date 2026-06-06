import { createHash } from "node:crypto";
import { argon2idAsync } from "@noble/hashes/argon2";
import { psql, sqlLiteral } from "../src/psql.js";

const templeA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const templeB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const devPassword = "Password123!";
const argonOptions = { t: 1, m: 1024, p: 1, dkLen: 32 };

interface SeedUser {
  tenantId: string;
  email: string;
  displayName: string;
  role: "admin" | "finance" | "staff";
}

const users: SeedUser[] = [
  { tenantId: templeA, email: "admin@wat-arun.example", displayName: "ผู้ดูแลวัดอรุณ", role: "admin" },
  { tenantId: templeA, email: "finance@wat-arun.example", displayName: "การเงินวัดอรุณ", role: "finance" },
  { tenantId: templeA, email: "staff@wat-arun.example", displayName: "เจ้าหน้าที่วัดอรุณ", role: "staff" },
  { tenantId: templeB, email: "admin@wat-pho.example", displayName: "ผู้ดูแลวัดโพธิ์", role: "admin" },
  { tenantId: templeB, email: "finance@wat-pho.example", displayName: "การเงินวัดโพธิ์", role: "finance" },
  { tenantId: templeB, email: "staff@wat-pho.example", displayName: "เจ้าหน้าที่วัดโพธิ์", role: "staff" },
];

function base64Url(value: Uint8Array): string {
  return Buffer.from(value).toString("base64url");
}

async function devPasswordHash(email: string): Promise<string> {
  const salt = createHash("sha256").update(`wat-demo:${email}`).digest().subarray(0, 16);
  const hash = await argon2idAsync(devPassword, salt, argonOptions);

  return `$argon2id$v=19$m=${argonOptions.m},t=${argonOptions.t},p=${argonOptions.p}$${base64Url(salt)}$${base64Url(hash)}`;
}

const userValues = (
  await Promise.all(
    users.map(async (user) => {
      const passwordHash = await devPasswordHash(user.email);

      return `(${sqlLiteral(user.tenantId)}, ${sqlLiteral(user.email)}, ${sqlLiteral(user.displayName)}, ${sqlLiteral(user.role)}, ${sqlLiteral(passwordHash)})`;
    }),
  )
).join(",\n    ");

interface SeedPlatformUser {
  id: string;
  email: string;
  displayName: string;
  platformRole: "super_admin" | "support";
}

const platformUsers: SeedPlatformUser[] = [
  {
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    email: "super@innovera.example",
    displayName: "Innovera Super Admin",
    platformRole: "super_admin",
  },
  {
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccd",
    email: "support@innovera.example",
    displayName: "Innovera Support",
    platformRole: "support",
  },
];

const platformUserValues = (
  await Promise.all(
    platformUsers.map(async (user) => {
      const passwordHash = await devPasswordHash(user.email);

      return `(${sqlLiteral(user.id)}, ${sqlLiteral(user.email)}, ${sqlLiteral(user.displayName)}, ${sqlLiteral(user.platformRole)}, ${sqlLiteral(passwordHash)})`;
    }),
  )
).join(",\n    ");

const devoteeHash = await devPasswordHash("devotee@example.com");

await psql(`
  SET ROLE wat_migrate;

  INSERT INTO temples (id, slug, name_th, name_en, status)
  VALUES
    ('${templeA}', 'wat-arun-demo', 'วัดอรุณเดโม', 'Wat Arun Demo', 'active'),
    ('${templeB}', 'wat-pho-demo', 'วัดโพธิ์เดโม', 'Wat Pho Demo', 'active')
  ON CONFLICT (id) DO UPDATE
  SET slug = EXCLUDED.slug,
      name_th = EXCLUDED.name_th,
      name_en = EXCLUDED.name_en,
      status = EXCLUDED.status,
      updated_at = now();

  -- Development seed credentials only. All seeded users use password: ${devPassword}
  INSERT INTO users (tenant_id, email, display_name, role, password_hash)
  VALUES
    ${userValues}
  ON CONFLICT (tenant_id, email) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      role = EXCLUDED.role,
      password_hash = EXCLUDED.password_hash,
      updated_at = now();

  INSERT INTO ledger_accounts (tenant_id, code, name_th, account_type)
  VALUES
    ('${templeA}', '1000', 'เงินสด', 'asset'),
    ('${templeA}', '1100', 'เงินฝากธนาคาร', 'asset'),
    ('${templeA}', '4000', 'รายรับเงินบริจาค', 'revenue'),
    ('${templeA}', '5000', 'ค่าใช้จ่ายทั่วไป', 'expense'),
    ('${templeB}', '1000', 'เงินสด', 'asset'),
    ('${templeB}', '1100', 'เงินฝากธนาคาร', 'asset'),
    ('${templeB}', '4000', 'รายรับเงินบริจาค', 'revenue'),
    ('${templeB}', '5000', 'ค่าใช้จ่ายทั่วไป', 'expense')
  ON CONFLICT (tenant_id, code) DO UPDATE
  SET name_th = EXCLUDED.name_th,
      account_type = EXCLUDED.account_type,
      updated_at = now();

  -- Innovera platform operators (separate plane, no tenant). Password: ${devPassword}
  -- is_active relies on its column DEFAULT true on insert; re-seed re-enables it.
  INSERT INTO platform_users (id, email, display_name, platform_role, password_hash)
  VALUES
    ${platformUserValues}
  ON CONFLICT (id) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      platform_role = EXCLUDED.platform_role,
      password_hash = EXCLUDED.password_hash,
      is_active = true,
      updated_at = now();

  -- One demo pending application (manual/demo only — tests insert their own).
  INSERT INTO temple_applications (id, temple_name_th, contact_email, status)
  VALUES
    ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'วัดขอสมัครเดโม', 'apply@example.com', 'pending')
  -- Only refresh the demo row while it is still pending; never resurrect an
  -- application that was already approved/rejected (that would orphan its temple).
  ON CONFLICT (id) DO UPDATE
  SET temple_name_th = EXCLUDED.temple_name_th,
      contact_email = EXCLUDED.contact_email,
      updated_at = now()
  WHERE temple_applications.status = 'pending';

  -- One demo devotee (ญาติโยม) self-service account. Password: ${devPassword}
  INSERT INTO devotee_accounts (id, email, display_name, password_hash)
  VALUES ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'devotee@example.com', 'คุณญาติโยมเดโม', ${sqlLiteral(devoteeHash)})
  ON CONFLICT (id) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      password_hash = EXCLUDED.password_hash,
      is_active = true,
      updated_at = now();

  RESET ROLE;
`);

console.log("Seeded 2 active temples, tenant users, ledger accounts, 2 platform operators, and a demo application.");
console.log("Development login password for all seeded users: Password123!");

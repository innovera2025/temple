import { execFile } from "node:child_process";

function execFileAsync(file: string, args: string[]): Promise<{ stdout: string }> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { maxBuffer: 1024 * 1024 }, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }

      resolve({ stdout });
    });
  });
}

function dockerContainer(): string {
  return process.env.POSTGRES_CONTAINER ?? "wat-dev-db";
}

function postgresUser(): string {
  return process.env.POSTGRES_USER ?? "wat_dev";
}

function postgresDb(): string {
  return process.env.POSTGRES_DB ?? "wat_dev";
}

export function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

export async function psql(sql: string): Promise<string> {
  const { stdout } = await execFileAsync(
    "docker",
    [
      "exec",
      "-i",
      dockerContainer(),
      "psql",
      "-U",
      postgresUser(),
      "-d",
      postgresDb(),
      "-v",
      "ON_ERROR_STOP=1",
      "-q",
      "-At",
      "-c",
      sql,
    ],
  );

  return stdout.trim();
}

export async function psqlJson<T>(sql: string): Promise<T[]> {
  const rows = await psql(
    `WITH q AS (${sql.replace(/;+\s*$/, "")}) SELECT COALESCE(json_agg(q), '[]'::json) FROM q;`,
  );

  return JSON.parse(rows || "[]") as T[];
}

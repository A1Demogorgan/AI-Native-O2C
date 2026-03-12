import duckdb from "duckdb";
import path from "node:path";
import fs from "node:fs";

const DB_PATH = path.join(process.cwd(), "data", "o2c.duckdb");

let db: duckdb.Database | null = null;

function getDatabase(): duckdb.Database {
  if (db) {
    return db;
  }

  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  db = new duckdb.Database(DB_PATH);
  return db;
}

export function dbAll<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  return new Promise((resolve, reject) => {
    getDatabase().all(sql, ...params, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve((rows as T[]) ?? []);
    });
  });
}

export async function dbGet<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | null> {
  const rows = await dbAll<T>(sql, params);
  return rows[0] ?? null;
}

export async function dbRun(sql: string, params: unknown[] = []): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    getDatabase().run(sql, ...params, (err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

export async function dbExec(sql: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    getDatabase().exec(sql, (err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

export function escapeSqlString(value: string): string {
  return value.replace(/'/g, "''");
}

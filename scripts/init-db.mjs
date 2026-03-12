import fs from "node:fs";
import path from "node:path";
import duckdb from "duckdb";

const dbPath = path.join(process.cwd(), "data", "o2c.duckdb");
const schemaPath = path.join(process.cwd(), "lib", "db", "schema.sql");

await fs.promises.mkdir(path.dirname(dbPath), { recursive: true });

const db = new duckdb.Database(dbPath);
const schema = await fs.promises.readFile(schemaPath, "utf-8");

const statements = schema
  .split(/;\s*(?:\r?\n|$)/)
  .map((statement) => statement.trim())
  .filter(Boolean);

for (const statement of statements) {
  await new Promise((resolve, reject) => {
    db.run(`${statement};`, (err) => (err ? reject(err) : resolve()));
  });
}

console.log("Database initialized.");

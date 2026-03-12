import fs from "node:fs";
import path from "node:path";
import { dbExec } from "../lib/db/duckdb";

async function main() {
  const schemaPath = path.join(process.cwd(), "lib", "db", "schema.sql");
  const schema = fs.readFileSync(schemaPath, "utf-8");
  const statements = schema
    .split(/;\s*(?:\r?\n|$)/)
    .map((statement) => statement.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await dbExec(`${statement};`);
  }
  console.log("Database initialized.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

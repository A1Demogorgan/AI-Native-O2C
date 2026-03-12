import fs from "node:fs";
import path from "node:path";

async function main() {
  const dbPath = path.join(process.cwd(), "data", "o2c.duckdb");
  if (fs.existsSync(dbPath)) {
    fs.rmSync(dbPath);
  }
  console.log("Database reset.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

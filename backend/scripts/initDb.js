// Drops and recreates all tables from database/schema.sql
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const pool = require("../src/db/pool");

async function main() {
  const schemaPath = path.join(__dirname, "..", "..", "database", "schema.sql");
  const sql = fs.readFileSync(schemaPath, "utf8");
  await pool.query(sql);
  console.log("Schema created");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

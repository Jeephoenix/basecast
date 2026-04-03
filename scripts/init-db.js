require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  console.log("Initialising BaseCast database tables...");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS usernames (
      address    TEXT PRIMARY KEY,
      username   TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS usernames_lower_idx
      ON usernames (LOWER(username));
  `);
  console.log("  usernames table OK");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS referrals (
      code   TEXT NOT NULL,
      wallet TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (code, wallet)
    );
    CREATE INDEX IF NOT EXISTS referrals_code_idx ON referrals (code);
  `);
  console.log("  referrals table OK");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ref_codes (
      code    TEXT NOT NULL,
      address TEXT PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS ref_codes_code_idx ON ref_codes (code);
  `);
  console.log("  ref_codes table OK");

  console.log("Database initialisation complete.");
  await pool.end();
}

main().catch(err => {
  console.error("DB init failed:", err.message);
  process.exit(1);
});

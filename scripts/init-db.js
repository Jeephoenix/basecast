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

  await pool.query(`
    CREATE TABLE IF NOT EXISTS predict_rounds (
      id          BIGSERIAL PRIMARY KEY,
      open_time   TIMESTAMPTZ NOT NULL UNIQUE,
      close_time  TIMESTAMPTZ NOT NULL,
      open_price  NUMERIC(18,2),
      close_price NUMERIC(18,2),
      result      TEXT,
      up_pool     NUMERIC(18,6) NOT NULL DEFAULT 0,
      down_pool   NUMERIC(18,6) NOT NULL DEFAULT 0,
      settled     BOOLEAN NOT NULL DEFAULT FALSE
    );
    CREATE TABLE IF NOT EXISTS predict_bets (
      id          BIGSERIAL PRIMARY KEY,
      round_id    BIGINT NOT NULL REFERENCES predict_rounds(id),
      address     TEXT NOT NULL,
      side        TEXT NOT NULL,
      amount      NUMERIC(18,6) NOT NULL,
      payout      NUMERIC(18,6),
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(round_id, address)
    );
  `);
  console.log("  predict_rounds + predict_bets tables OK");

  console.log("Database initialisation complete.");
  await pool.end();
}

main().catch(err => {
  console.error("DB init failed:", err.message);
  process.exit(1);
});

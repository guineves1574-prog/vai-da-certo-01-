import fs from "fs/promises";
import path from "path";
import { pool } from "./postgres";

async function ensureBaseSchema() {
  const schemaPath = path.resolve(__dirname, "../../sql/schema.sql");
  const schemaSql = await fs.readFile(schemaPath, "utf8");
  await pool.query(schemaSql);
}

export async function ensureSchemaUpgrades() {
  await ensureBaseSchema();

  await pool.query(`
    ALTER TABLE bot_settings
      ADD COLUMN IF NOT EXISTS trailing_stop_pct NUMERIC(10, 4) NOT NULL DEFAULT 2.5,
      ADD COLUMN IF NOT EXISTS break_even_trigger_pct NUMERIC(10, 4) NOT NULL DEFAULT 1.5,
      ADD COLUMN IF NOT EXISTS max_spread_pct NUMERIC(10, 4) NOT NULL DEFAULT 0.4,
      ADD COLUMN IF NOT EXISTS slippage_pct NUMERIC(10, 4) NOT NULL DEFAULT 0.2,
      ADD COLUMN IF NOT EXISTS taker_fee_pct NUMERIC(10, 4) NOT NULL DEFAULT 0.1,
      ADD COLUMN IF NOT EXISTS maker_fee_pct NUMERIC(10, 4) NOT NULL DEFAULT 0.1;
  `);

  await pool.query(`
    ALTER TABLE positions
      ADD COLUMN IF NOT EXISTS strategy TEXT,
      ADD COLUMN IF NOT EXISTS peak_price NUMERIC(18, 8) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS trailing_armed BOOLEAN NOT NULL DEFAULT FALSE;
  `);

  await pool.query(`
    ALTER TABLE trade_orders
      ADD COLUMN IF NOT EXISTS strategy TEXT,
      ADD COLUMN IF NOT EXISTS client_order_id TEXT,
      ADD COLUMN IF NOT EXISTS executed_price NUMERIC(18, 8),
      ADD COLUMN IF NOT EXISTS executed_quantity NUMERIC(18, 8),
      ADD COLUMN IF NOT EXISTS exchange_status TEXT;
  `);

  await pool.query(`
    UPDATE positions
    SET peak_price = CASE
      WHEN peak_price = 0 THEN GREATEST(entry_price, current_price)
      ELSE peak_price
    END
    WHERE status = 'OPEN';
  `);
}

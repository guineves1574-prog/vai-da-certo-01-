CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  account_balance NUMERIC(18, 8) NOT NULL DEFAULT 10000,
  telegram_chat_id TEXT,
  telegram_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS api_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  encrypted_key TEXT NOT NULL,
  encrypted_secret TEXT,
  encrypted_passphrase TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, provider)
);

CREATE TABLE IF NOT EXISTS bot_settings (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  mode TEXT NOT NULL DEFAULT 'simulation',
  active BOOLEAN NOT NULL DEFAULT FALSE,
  quote_asset TEXT NOT NULL DEFAULT 'USDT',
  base_trade_amount NUMERIC(18, 8) NOT NULL DEFAULT 100,
  max_open_trades INTEGER NOT NULL DEFAULT 3,
  whitelist TEXT[] NOT NULL DEFAULT '{}',
  blacklist TEXT[] NOT NULL DEFAULT '{}',
  analysis_interval_minutes INTEGER NOT NULL DEFAULT 5,
  max_daily_loss_pct NUMERIC(10, 4) NOT NULL DEFAULT 5,
  stop_loss_pct NUMERIC(10, 4) NOT NULL DEFAULT 5,
  take_profit_pct NUMERIC(10, 4) NOT NULL DEFAULT 10,
  max_position_size_pct NUMERIC(10, 4) NOT NULL DEFAULT 10,
  cooldown_minutes INTEGER NOT NULL DEFAULT 30,
  min_confidence INTEGER NOT NULL DEFAULT 65,
  max_daily_trades INTEGER NOT NULL DEFAULT 10,
  low_market_cap_limit NUMERIC(18, 2) NOT NULL DEFAULT 500000000,
  min_volume_growth_pct NUMERIC(10, 4) NOT NULL DEFAULT 15,
  trailing_stop_pct NUMERIC(10, 4) NOT NULL DEFAULT 2.5,
  break_even_trigger_pct NUMERIC(10, 4) NOT NULL DEFAULT 1.5,
  max_spread_pct NUMERIC(10, 4) NOT NULL DEFAULT 0.4,
  slippage_pct NUMERIC(10, 4) NOT NULL DEFAULT 0.2,
  taker_fee_pct NUMERIC(10, 4) NOT NULL DEFAULT 0.1,
  maker_fee_pct NUMERIC(10, 4) NOT NULL DEFAULT 0.1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  strategy TEXT,
  side TEXT NOT NULL,
  mode TEXT NOT NULL,
  quantity NUMERIC(18, 8) NOT NULL,
  entry_price NUMERIC(18, 8) NOT NULL,
  current_price NUMERIC(18, 8) NOT NULL,
  stop_loss_price NUMERIC(18, 8) NOT NULL,
  take_profit_price NUMERIC(18, 8) NOT NULL,
  peak_price NUMERIC(18, 8) NOT NULL DEFAULT 0,
  trailing_armed BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'OPEN',
  ai_confidence INTEGER NOT NULL DEFAULT 0,
  rationale TEXT,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  realized_pnl NUMERIC(18, 8) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS trade_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  strategy TEXT,
  side TEXT NOT NULL,
  order_type TEXT NOT NULL,
  mode TEXT NOT NULL,
  quantity NUMERIC(18, 8) NOT NULL,
  price NUMERIC(18, 8),
  status TEXT NOT NULL,
  ai_signal TEXT,
  ai_confidence INTEGER NOT NULL DEFAULT 0,
  rationale TEXT,
  exchange_order_id TEXT,
  client_order_id TEXT,
  executed_price NUMERIC(18, 8),
  executed_quantity NUMERIC(18, 8),
  exchange_status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bot_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'RUNNING',
  notes TEXT
);

CREATE TABLE IF NOT EXISTS alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  event_type TEXT NOT NULL,
  message TEXT NOT NULL,
  delivered BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_positions_user_status ON positions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_trade_orders_user_created_at ON trade_orders(user_id, created_at DESC);

ALTER TABLE bot_settings
  ADD COLUMN IF NOT EXISTS trailing_stop_pct NUMERIC(10, 4) NOT NULL DEFAULT 2.5,
  ADD COLUMN IF NOT EXISTS break_even_trigger_pct NUMERIC(10, 4) NOT NULL DEFAULT 1.5,
  ADD COLUMN IF NOT EXISTS max_spread_pct NUMERIC(10, 4) NOT NULL DEFAULT 0.4,
  ADD COLUMN IF NOT EXISTS slippage_pct NUMERIC(10, 4) NOT NULL DEFAULT 0.2,
  ADD COLUMN IF NOT EXISTS taker_fee_pct NUMERIC(10, 4) NOT NULL DEFAULT 0.1,
  ADD COLUMN IF NOT EXISTS maker_fee_pct NUMERIC(10, 4) NOT NULL DEFAULT 0.1;

ALTER TABLE positions
  ADD COLUMN IF NOT EXISTS strategy TEXT,
  ADD COLUMN IF NOT EXISTS peak_price NUMERIC(18, 8) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS trailing_armed BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE trade_orders
  ADD COLUMN IF NOT EXISTS strategy TEXT,
  ADD COLUMN IF NOT EXISTS client_order_id TEXT,
  ADD COLUMN IF NOT EXISTS executed_price NUMERIC(18, 8),
  ADD COLUMN IF NOT EXISTS executed_quantity NUMERIC(18, 8),
  ADD COLUMN IF NOT EXISTS exchange_status TEXT;

import { env } from "../config/env";
import { AppError } from "../core/errors";
import { RiskSettings } from "../core/types";
import { query } from "../db/postgres";

type BotSettingsRow = {
  user_id: string;
  mode: "real" | "simulation";
  active: boolean;
  quote_asset: string;
  base_trade_amount: string;
  max_open_trades: number;
  whitelist: string[];
  blacklist: string[];
  analysis_interval_minutes: number;
  max_daily_loss_pct: string;
  stop_loss_pct: string;
  take_profit_pct: string;
  max_position_size_pct: string;
  cooldown_minutes: number;
  min_confidence: number;
  max_daily_trades: number;
  low_market_cap_limit: string;
  min_volume_growth_pct: string;
  trailing_stop_pct: string;
  break_even_trigger_pct: string;
  max_spread_pct: string;
  slippage_pct: string;
  taker_fee_pct: string;
  maker_fee_pct: string;
};

function mapRow(row: BotSettingsRow): RiskSettings {
  return {
    mode: row.mode,
    quoteAsset: row.quote_asset,
    baseTradeAmount: Number(row.base_trade_amount),
    maxOpenTrades: row.max_open_trades,
    whitelist: row.whitelist,
    blacklist: row.blacklist,
    analysisIntervalMinutes: row.analysis_interval_minutes,
    maxDailyLossPct: Number(row.max_daily_loss_pct),
    stopLossPct: Number(row.stop_loss_pct),
    takeProfitPct: Number(row.take_profit_pct),
    maxPositionSizePct: Number(row.max_position_size_pct),
    cooldownMinutes: row.cooldown_minutes,
    minConfidence: row.min_confidence,
    maxDailyTrades: row.max_daily_trades,
    lowMarketCapLimit: Number(row.low_market_cap_limit),
    minVolumeGrowthPct: Number(row.min_volume_growth_pct),
    trailingStopPct: Number(row.trailing_stop_pct),
    breakEvenTriggerPct: Number(row.break_even_trigger_pct),
    maxSpreadPct: Number(row.max_spread_pct),
    slippagePct: Number(row.slippage_pct),
    takerFeePct: Number(row.taker_fee_pct),
    makerFeePct: Number(row.maker_fee_pct),
    active: row.active
  };
}

export class BotSettingsService {
  async getSettings(userId: string): Promise<RiskSettings> {
    const [row] = await query<BotSettingsRow>("SELECT * FROM bot_settings WHERE user_id = $1", [userId]);
    if (!row) {
      throw new AppError("Bot settings not found", 404);
    }
    return mapRow(row);
  }

  async upsertSettings(userId: string, input: Partial<RiskSettings>): Promise<RiskSettings> {
    await query(
      `INSERT INTO bot_settings (
         user_id, mode, active, quote_asset, base_trade_amount, max_open_trades, whitelist, blacklist,
         analysis_interval_minutes, max_daily_loss_pct, stop_loss_pct, take_profit_pct,
         max_position_size_pct, cooldown_minutes, min_confidence, max_daily_trades,
         low_market_cap_limit, min_volume_growth_pct, trailing_stop_pct, break_even_trigger_pct,
         max_spread_pct, slippage_pct, taker_fee_pct, maker_fee_pct
       )
       VALUES (
         $1, COALESCE($2, $19), COALESCE($3, FALSE), COALESCE($4, 'USDT'), COALESCE($5, 100),
         COALESCE($6, 3), COALESCE($7, '{}'::text[]), COALESCE($8, '{}'::text[]), COALESCE($9, $20),
         COALESCE($10, 5), COALESCE($11, 5), COALESCE($12, 10), COALESCE($13, 10), COALESCE($14, 30),
         COALESCE($15, 65), COALESCE($16, 10), COALESCE($17, 500000000), COALESCE($18, 15),
         COALESCE($21, 2.5), COALESCE($22, 1.5), COALESCE($23, 0.4), COALESCE($24, 0.2),
         COALESCE($25, 0.1), COALESCE($26, 0.1)
       )
       ON CONFLICT (user_id)
       DO UPDATE SET
         mode = COALESCE($2, bot_settings.mode),
         active = COALESCE($3, bot_settings.active),
         quote_asset = COALESCE($4, bot_settings.quote_asset),
         base_trade_amount = COALESCE($5, bot_settings.base_trade_amount),
         max_open_trades = COALESCE($6, bot_settings.max_open_trades),
         whitelist = COALESCE($7, bot_settings.whitelist),
         blacklist = COALESCE($8, bot_settings.blacklist),
         analysis_interval_minutes = COALESCE($9, bot_settings.analysis_interval_minutes),
         max_daily_loss_pct = COALESCE($10, bot_settings.max_daily_loss_pct),
         stop_loss_pct = COALESCE($11, bot_settings.stop_loss_pct),
         take_profit_pct = COALESCE($12, bot_settings.take_profit_pct),
         max_position_size_pct = COALESCE($13, bot_settings.max_position_size_pct),
         cooldown_minutes = COALESCE($14, bot_settings.cooldown_minutes),
         min_confidence = COALESCE($15, bot_settings.min_confidence),
         max_daily_trades = COALESCE($16, bot_settings.max_daily_trades),
         low_market_cap_limit = COALESCE($17, bot_settings.low_market_cap_limit),
         min_volume_growth_pct = COALESCE($18, bot_settings.min_volume_growth_pct),
         trailing_stop_pct = COALESCE($21, bot_settings.trailing_stop_pct),
         break_even_trigger_pct = COALESCE($22, bot_settings.break_even_trigger_pct),
         max_spread_pct = COALESCE($23, bot_settings.max_spread_pct),
         slippage_pct = COALESCE($24, bot_settings.slippage_pct),
         taker_fee_pct = COALESCE($25, bot_settings.taker_fee_pct),
         maker_fee_pct = COALESCE($26, bot_settings.maker_fee_pct),
         updated_at = NOW()`,
      [
        userId,
        input.mode,
        input.active,
        input.quoteAsset,
        input.baseTradeAmount,
        input.maxOpenTrades,
        input.whitelist,
        input.blacklist,
        input.analysisIntervalMinutes,
        input.maxDailyLossPct,
        input.stopLossPct,
        input.takeProfitPct,
        input.maxPositionSizePct,
        input.cooldownMinutes,
        input.minConfidence,
        input.maxDailyTrades,
        input.lowMarketCapLimit,
        input.minVolumeGrowthPct,
        input.trailingStopPct,
        input.breakEvenTriggerPct,
        input.maxSpreadPct,
        input.slippagePct,
        input.takerFeePct,
        input.makerFeePct,
        env.DEFAULT_MODE,
        env.ANALYSIS_INTERVAL_MINUTES
      ]
    );

    return this.getSettings(userId);
  }
}

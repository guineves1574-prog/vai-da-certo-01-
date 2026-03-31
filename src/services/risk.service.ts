import {
  AISignal,
  MarketCandidate,
  PortfolioSnapshot,
  RiskSettings,
  TradeDecision
} from "../core/types";
import { query } from "../db/postgres";

export class RiskService {
  async assessTrade(
    userId: string,
    settings: RiskSettings,
    portfolio: PortfolioSnapshot,
    candidate: MarketCandidate,
    signal: AISignal
  ): Promise<TradeDecision> {
    if (signal.action !== "buy") {
      return { approved: false, reason: "Signal is not a buy recommendation.", quantity: 0 };
    }

    if (signal.confidence < settings.minConfidence) {
      return { approved: false, reason: "Signal confidence below minimum threshold.", quantity: 0 };
    }

    if (signal.technicalScore < 18) {
      return { approved: false, reason: "Technical score below minimum quality threshold.", quantity: 0 };
    }

    if (signal.strategy === "breakout" && signal.confidence < settings.minConfidence + 3) {
      return { approved: false, reason: "Breakout setup needs stronger confidence before entry.", quantity: 0 };
    }

    if (signal.strategy === "trend_pullback" && signal.technicalScore < 20) {
      return { approved: false, reason: "Trend pullback needs cleaner technical structure.", quantity: 0 };
    }

    if (signal.strategy === "short_reversal") {
      if (signal.confidence < settings.minConfidence + 6) {
        return { approved: false, reason: "Short reversal setup requires extra confidence.", quantity: 0 };
      }
      if (signal.technicalScore < 24) {
        return { approved: false, reason: "Short reversal rejected due to weak reversal quality.", quantity: 0 };
      }
    }

    if (signal.strategy === "mean_reversion") {
      if (signal.confidence < settings.minConfidence + 4) {
        return { approved: false, reason: "Mean reversion setup requires stronger confirmation.", quantity: 0 };
      }
      if (signal.technicalScore < 20) {
        return { approved: false, reason: "Mean reversion blocked by weak technical context.", quantity: 0 };
      }
    }

    if (signal.strategy === "volatility_squeeze") {
      if (signal.confidence < settings.minConfidence + 2) {
        return { approved: false, reason: "Volatility squeeze needs more confidence before release.", quantity: 0 };
      }
      if (signal.technicalScore < 22) {
        return { approved: false, reason: "Volatility squeeze blocked by insufficient structure quality.", quantity: 0 };
      }
    }

    const reasonsText = signal.reasons.join(" ").toLowerCase();
    if (reasonsText.includes("fake breakout risk: high")) {
      return { approved: false, reason: "Market structure not clean enough for entry.", quantity: 0 };
    }

    if (!["short_reversal", "mean_reversion", "volatility_squeeze"].includes(signal.strategy) && reasonsText.includes("market regime: range")) {
      return { approved: false, reason: "Range market blocked for trend-following setups.", quantity: 0 };
    }

    if (settings.blacklist.includes(candidate.symbol)) {
      return { approved: false, reason: "Asset is blacklisted.", quantity: 0 };
    }

    if (settings.whitelist.length > 0 && !settings.whitelist.includes(candidate.symbol)) {
      return { approved: false, reason: "Asset not present in whitelist.", quantity: 0 };
    }

    if (portfolio.openPositions >= settings.maxOpenTrades) {
      return { approved: false, reason: "Maximum open trades reached.", quantity: 0 };
    }

    if (portfolio.todayTrades >= settings.maxDailyTrades) {
      return { approved: false, reason: "Daily trade limit reached.", quantity: 0 };
    }

    if (portfolio.todayRealizedPnl <= -(portfolio.cashBalance * settings.maxDailyLossPct) / 100) {
      return { approved: false, reason: "Daily loss limit reached.", quantity: 0 };
    }

    const [recentTrade] = await query<{ created_at: string }>(
      `SELECT created_at
       FROM trade_orders
       WHERE user_id = $1 AND symbol = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId, candidate.symbol]
    );

    if (recentTrade) {
      const cooldownMs = settings.cooldownMinutes * 60 * 1000;
      const elapsed = Date.now() - new Date(recentTrade.created_at).getTime();
      if (elapsed < cooldownMs) {
        return { approved: false, reason: "Cooldown active for this asset.", quantity: 0 };
      }
    }

    const capitalAtRisk = Math.min(
      settings.baseTradeAmount,
      (portfolio.cashBalance * settings.maxPositionSizePct) / 100
    );

    if (capitalAtRisk <= 0 || capitalAtRisk > portfolio.cashBalance) {
      return { approved: false, reason: "Insufficient cash for position sizing.", quantity: 0 };
    }

    const quantity = Number((capitalAtRisk / candidate.currentPrice).toFixed(8));
    if (quantity <= 0) {
      return { approved: false, reason: "Calculated quantity is zero.", quantity: 0 };
    }

    return {
      approved: true,
      reason: "Risk checks passed with technical confirmation.",
      quantity,
      stopLossPrice: Number((candidate.currentPrice * (1 - settings.stopLossPct / 100)).toFixed(8)),
      takeProfitPrice: Number((candidate.currentPrice * (1 + settings.takeProfitPct / 100)).toFixed(8))
    };
  }
}

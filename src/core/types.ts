export type TradeMode = "real" | "simulation";
export type SignalAction = "buy" | "sell" | "hold";
export type OrderType = "market" | "limit";

export interface MarketCandidate {
  symbol: string;
  coinId: string;
  currentPrice: number;
  marketCap: number;
  volume24h: number;
  volumeGrowthPct: number;
  priceChange24h: number;
  liquidityScore: number;
}

export interface AISignal {
  action: SignalAction;
  confidence: number;
  technicalScore: number;
  summary: string;
  riskLevel: "low" | "medium" | "high";
  reasons: string[];
}

export interface CandleAnalytics {
  timeframe: string;
  trendPct: number;
  momentumPct: number;
  volatilityPct: number;
  volumeVsAveragePct: number;
  bullishCloseRatio: number;
  bodyStrengthPct: number;
  upperWickPct: number;
  lowerWickPct: number;
  pattern:
    | "breakout"
    | "bullish_engulfing"
    | "bearish_engulfing"
    | "rejection"
    | "inside_bar"
    | "continuation"
    | "none";
  structure: "bullish" | "bearish" | "neutral";
  score: number;
}

export interface CandleDecisionContext {
  fast: CandleAnalytics;
  swing: CandleAnalytics;
  alignment: "bullish" | "bearish" | "mixed";
  regime: "trend" | "range" | "breakout" | "high_volatility";
  fakeBreakoutRisk: "low" | "medium" | "high";
  combinedScore: number;
}

export interface TechnicalIndicators {
  timeframe: string;
  ema9: number;
  ema21: number;
  ema50: number;
  rsi14: number;
  atr14Pct: number;
  vwap: number;
  macd: number;
  macdSignal: number;
  macdHistogram: number;
}

export interface RiskSettings {
  mode: TradeMode;
  quoteAsset: string;
  baseTradeAmount: number;
  maxOpenTrades: number;
  whitelist: string[];
  blacklist: string[];
  analysisIntervalMinutes: number;
  maxDailyLossPct: number;
  stopLossPct: number;
  takeProfitPct: number;
  maxPositionSizePct: number;
  cooldownMinutes: number;
  minConfidence: number;
  maxDailyTrades: number;
  lowMarketCapLimit: number;
  minVolumeGrowthPct: number;
  trailingStopPct: number;
  breakEvenTriggerPct: number;
  maxSpreadPct: number;
  slippagePct: number;
  takerFeePct: number;
  makerFeePct: number;
  active: boolean;
}

export interface TradeDecision {
  approved: boolean;
  reason: string;
  quantity: number;
  stopLossPrice?: number;
  takeProfitPrice?: number;
}

export interface PortfolioSnapshot {
  cashBalance: number;
  openPositions: number;
  exposure: number;
  todayRealizedPnl: number;
  todayTrades: number;
}

export interface TradeExecutionRequest {
  userId: string;
  symbol: string;
  orderType: OrderType;
  side: "BUY" | "SELL";
  price?: number;
  quantity: number;
  mode: TradeMode;
  clientOrderId?: string;
  maxSpreadPct?: number;
  aiSignal?: AISignal & { stopLossPrice?: number; takeProfitPrice?: number };
}

export interface Kline {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
}

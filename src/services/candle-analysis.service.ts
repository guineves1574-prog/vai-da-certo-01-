import { CandleAnalytics, CandleDecisionContext, Kline } from "../core/types";
import { TechnicalIndicatorsService } from "./technical-indicators.service";

function percentChange(current: number, previous: number) {
  return ((current - previous) / Math.max(previous, 1e-9)) * 100;
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export class CandleAnalysisService {
  constructor(private readonly technicalIndicatorsService = new TechnicalIndicatorsService()) {}

  analyze(klines: Kline[], timeframe: string): CandleAnalytics {
    const usable = klines.slice(-30);
    const last = usable.at(-1);
    const prev = usable.at(-2);
    const first = usable.at(0);

    if (!last || !prev || !first) {
      return {
        timeframe,
        trendPct: 0,
        momentumPct: 0,
        volatilityPct: 0,
        volumeVsAveragePct: 0,
        bullishCloseRatio: 0.5,
        bodyStrengthPct: 0,
        upperWickPct: 0,
        lowerWickPct: 0,
        pattern: "none",
        structure: "neutral",
        score: 0
      };
    }

    const closes = usable.map((candle) => candle.close);
    const volumes = usable.map((candle) => candle.volume);
    const candleRanges = usable.map((candle) => Math.max(candle.high - candle.low, 1e-9));
    const bullishCloseRatio =
      usable.filter((candle) => candle.close >= candle.open).length / usable.length;

    const trendPct = percentChange(last.close, first.close);
    const momentumPct = percentChange(last.close, prev.close);
    const volatilityPct = (average(candleRanges) / Math.max(last.close, 1e-9)) * 100;
    const avgVolume = average(volumes.slice(0, -1));
    const volumeVsAveragePct = ((last.volume - avgVolume) / Math.max(avgVolume, 1e-9)) * 100;

    const lastRange = Math.max(last.high - last.low, 1e-9);
    const bodyStrengthPct = (Math.abs(last.close - last.open) / lastRange) * 100;
    const upperWickPct = ((last.high - Math.max(last.open, last.close)) / lastRange) * 100;
    const lowerWickPct = ((Math.min(last.open, last.close) - last.low) / lastRange) * 100;

    const resistance = Math.max(...closes.slice(-10, -1));
    const support = Math.min(...closes.slice(-10, -1));

    let pattern: CandleAnalytics["pattern"] = "none";
    if (last.close > resistance && volumeVsAveragePct > 15) {
      pattern = "breakout";
    } else if (
      prev.close < prev.open &&
      last.close > last.open &&
      last.open <= prev.close &&
      last.close >= prev.open
    ) {
      pattern = "bullish_engulfing";
    } else if (
      prev.close > prev.open &&
      last.close < last.open &&
      last.open >= prev.close &&
      last.close <= prev.open
    ) {
      pattern = "bearish_engulfing";
    } else if (lowerWickPct > 45 && last.close > last.open) {
      pattern = "rejection";
    } else if (last.high <= prev.high && last.low >= prev.low) {
      pattern = "inside_bar";
    } else if (trendPct > 0 && momentumPct > 0) {
      pattern = "continuation";
    }

    const structure =
      last.close > support && trendPct > 0.8 && bullishCloseRatio >= 0.55
        ? "bullish"
        : trendPct < -0.8 && bullishCloseRatio <= 0.45
          ? "bearish"
          : "neutral";

    const scoreRaw =
      trendPct * 1.2 +
      momentumPct * 3 +
      Math.min(volumeVsAveragePct, 100) * 0.18 +
      bullishCloseRatio * 25 +
      bodyStrengthPct * 0.08 -
      volatilityPct * 0.7 +
      (pattern === "breakout" || pattern === "bullish_engulfing" || pattern === "continuation"
        ? 10
        : pattern === "bearish_engulfing"
          ? -12
          : pattern === "rejection"
            ? 4
            : pattern === "inside_bar"
              ? -2
              : 0);

    return {
      timeframe,
      trendPct: Number(trendPct.toFixed(2)),
      momentumPct: Number(momentumPct.toFixed(2)),
      volatilityPct: Number(volatilityPct.toFixed(2)),
      volumeVsAveragePct: Number(volumeVsAveragePct.toFixed(2)),
      bullishCloseRatio: Number((bullishCloseRatio * 100).toFixed(2)),
      bodyStrengthPct: Number(bodyStrengthPct.toFixed(2)),
      upperWickPct: Number(upperWickPct.toFixed(2)),
      lowerWickPct: Number(lowerWickPct.toFixed(2)),
      pattern,
      structure,
      score: Number(Math.max(-100, Math.min(100, scoreRaw)).toFixed(2))
    };
  }

  buildDecisionContext(fastKlines: Kline[], swingKlines: Kline[]): CandleDecisionContext {
    const fast = this.analyze(fastKlines, "15m");
    const swing = this.analyze(swingKlines, "1h");
    const fastTechnicals = this.technicalIndicatorsService.analyze(fastKlines, "15m");
    const swingTechnicals = this.technicalIndicatorsService.analyze(swingKlines, "1h");
    const lastFastPrice = fastKlines.at(-1)?.close ?? 0;
    const lastSwingPrice = swingKlines.at(-1)?.close ?? 0;
    const alignment =
      fast.structure === swing.structure
        ? fast.structure === "neutral"
          ? "mixed"
          : fast.structure
        : "mixed";
    const fakeBreakoutRisk =
      fast.pattern === "breakout" &&
      (fast.upperWickPct > 35 ||
        fast.volumeVsAveragePct < 10 ||
        !this.technicalIndicatorsService.isBullish(fastTechnicals, lastFastPrice))
        ? "high"
        : fast.pattern === "breakout" && fast.upperWickPct > 20
          ? "medium"
          : "low";
    const regime =
      fast.pattern === "breakout" && fakeBreakoutRisk !== "high"
        ? "breakout"
        : fastTechnicals.atr14Pct > 4
          ? "high_volatility"
          : alignment !== "mixed" &&
              (this.technicalIndicatorsService.isBullish(swingTechnicals, lastSwingPrice) ||
                this.technicalIndicatorsService.isBearish(swingTechnicals, lastSwingPrice))
            ? "trend"
            : Math.abs(swing.trendPct) < 1.5
              ? "range"
              : "trend";
    const technicalBias =
      this.technicalIndicatorsService.isBullish(fastTechnicals, lastFastPrice) &&
      this.technicalIndicatorsService.isBullish(swingTechnicals, lastSwingPrice)
        ? 8
        : this.technicalIndicatorsService.isBearish(fastTechnicals, lastFastPrice) &&
            this.technicalIndicatorsService.isBearish(swingTechnicals, lastSwingPrice)
          ? -8
          : 0;
    const combinedScore = Number(
      (fast.score * 0.6 + swing.score * 0.4 + technicalBias - (fakeBreakoutRisk === "high" ? 10 : 0)).toFixed(2)
    );

    return {
      fast,
      swing,
      alignment,
      regime,
      fakeBreakoutRisk,
      combinedScore
    };
  }
}

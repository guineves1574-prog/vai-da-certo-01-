import { env } from "../config/env";
import { AISignal, CandleDecisionContext, Kline, MarketCandidate, TechnicalIndicators, TradeStrategy } from "../core/types";
import { fetchJson } from "../lib/http";
import { CandleAnalysisService } from "./candle-analysis.service";
import { TechnicalIndicatorsService } from "./technical-indicators.service";

interface ChatCompletionResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

export class AIAnalysisService {
  constructor(
    private readonly candleAnalysisService = new CandleAnalysisService(),
    private readonly technicalIndicatorsService = new TechnicalIndicatorsService()
  ) {}

  private buildStrategySignal(
    strategy: TradeStrategy,
    confidence: number,
    technicalScore: number,
    riskLevel: AISignal["riskLevel"],
    summary: string,
    reasons: string[],
    action: AISignal["action"]
  ): AISignal {
    return {
      action,
      strategy,
      confidence: Math.max(0, Math.min(100, Math.round(confidence))),
      technicalScore: Math.max(-100, Math.min(100, Math.round(technicalScore))),
      riskLevel,
      summary,
      reasons
    };
  }

  private evaluateStrategies(
    candidate: MarketCandidate,
    candleContext: CandleDecisionContext,
    fastTechnicals: TechnicalIndicators,
    swingTechnicals: TechnicalIndicators,
    fastKlines: Kline[],
    swingKlines: Kline[]
  ) {
    const currentFastPrice = fastKlines.at(-1)?.close ?? candidate.currentPrice;
    const currentSwingPrice = swingKlines.at(-1)?.close ?? candidate.currentPrice;
    const breakoutQuality =
      (candleContext.fast.pattern === "breakout" ? 30 : candleContext.fast.pattern === "continuation" ? 18 : 0) +
      Math.max(0, candleContext.fast.volumeVsAveragePct) * 0.35 +
      (candleContext.alignment === "bullish" ? 12 : -6) +
      (candleContext.regime === "breakout" ? 12 : candleContext.regime === "trend" ? 6 : -8) +
      (this.technicalIndicatorsService.isBullish(fastTechnicals, currentFastPrice) ? 10 : -8) +
      (this.technicalIndicatorsService.isBullish(swingTechnicals, currentSwingPrice) ? 10 : -8) -
      (candleContext.fakeBreakoutRisk === "high" ? 22 : candleContext.fakeBreakoutRisk === "medium" ? 8 : 0);

    const priceNearPullbackZone =
      currentFastPrice <= fastTechnicals.ema9 * 1.012 && currentFastPrice >= fastTechnicals.ema21 * 0.992;
    const trendPullbackQuality =
      (candleContext.regime === "trend" ? 18 : -6) +
      (candleContext.swing.structure === "bullish" ? 14 : -10) +
      (priceNearPullbackZone ? 16 : -6) +
      (["rejection", "bullish_engulfing", "inside_bar", "continuation"].includes(candleContext.fast.pattern) ? 14 : 0) +
      (fastTechnicals.rsi14 >= 45 && fastTechnicals.rsi14 <= 64 ? 10 : -4) +
      (currentFastPrice >= fastTechnicals.vwap ? 6 : -4) +
      (this.technicalIndicatorsService.isBullish(swingTechnicals, currentSwingPrice) ? 10 : -6);

    const exhaustionBounce =
      candleContext.fast.lowerWickPct > 38 || candleContext.fast.pattern === "rejection" || candleContext.fast.pattern === "bullish_engulfing";
    const shortReversalQuality =
      (candleContext.regime === "range" || candleContext.regime === "high_volatility" ? 10 : 0) +
      (candleContext.alignment === "mixed" ? 10 : candleContext.alignment === "bearish" ? 2 : -8) +
      (fastTechnicals.rsi14 >= 28 && fastTechnicals.rsi14 <= 46 ? 18 : -8) +
      (exhaustionBounce ? 18 : -10) +
      Math.max(0, candleContext.fast.volumeVsAveragePct) * 0.18 +
      (currentFastPrice >= fastTechnicals.vwap ? 6 : 0) -
      (candleContext.swing.structure === "bearish" ? 12 : 0);

    const distanceToFastMeanPct =
      ((fastTechnicals.ema21 - currentFastPrice) / Math.max(currentFastPrice, 1e-9)) * 100;
    const meanReversionQuality =
      (candleContext.regime === "range" ? 18 : candleContext.regime === "high_volatility" ? 8 : -8) +
      (distanceToFastMeanPct >= 1.2 ? 16 : distanceToFastMeanPct >= 0.7 ? 8 : -10) +
      (fastTechnicals.rsi14 <= 38 ? 16 : fastTechnicals.rsi14 <= 45 ? 8 : -8) +
      (["rejection", "bullish_engulfing", "inside_bar"].includes(candleContext.fast.pattern) ? 14 : 0) +
      (candleContext.fast.lowerWickPct > 34 ? 10 : 0) +
      (candleContext.swing.structure === "bearish" ? -8 : 4) +
      (currentFastPrice < fastTechnicals.vwap ? 8 : -2);

    const recentFastRange = fastKlines.slice(-12).map((candle) => Math.max(candle.high - candle.low, 1e-9));
    const avgRecentFastRange =
      recentFastRange.reduce((sum, value) => sum + value, 0) / Math.max(recentFastRange.length, 1);
    const squeezeCompressionPct = (avgRecentFastRange / Math.max(currentFastPrice, 1e-9)) * 100;
    const volatilitySqueezeQuality =
      (squeezeCompressionPct <= 0.9 ? 20 : squeezeCompressionPct <= 1.3 ? 12 : -8) +
      (fastTechnicals.atr14Pct <= 2.2 ? 14 : fastTechnicals.atr14Pct <= 3 ? 6 : -6) +
      (candleContext.fast.pattern === "breakout" || candleContext.fast.pattern === "continuation" ? 14 : 0) +
      Math.max(0, candleContext.fast.volumeVsAveragePct) * 0.24 +
      (candleContext.alignment === "bullish" ? 10 : candleContext.alignment === "mixed" ? 3 : -8) +
      (this.technicalIndicatorsService.isBullish(fastTechnicals, currentFastPrice) ? 8 : -6) +
      (this.technicalIndicatorsService.isBullish(swingTechnicals, currentSwingPrice) ? 8 : -6);

    return {
      breakout: breakoutQuality,
      trend_pullback: trendPullbackQuality,
      short_reversal: shortReversalQuality,
      mean_reversion: meanReversionQuality,
      volatility_squeeze: volatilitySqueezeQuality
    };
  }

  private heuristicSignal(
    candidate: MarketCandidate,
    fastKlines: Kline[],
    swingKlines: Kline[],
    candleContext: CandleDecisionContext
  ): AISignal {
    const fastTechnicals = this.technicalIndicatorsService.analyze(fastKlines, "15m");
    const swingTechnicals = this.technicalIndicatorsService.analyze(swingKlines, "1h");
    const last = fastKlines.at(-1)?.close ?? candidate.currentPrice;
    const first = swingKlines.at(0)?.close ?? candidate.currentPrice;
    const trendPct = ((last - first) / Math.max(first, 1e-9)) * 100;
    const score =
      candidate.volumeGrowthPct * 0.25 +
      candidate.liquidityScore * 0.15 +
      Math.max(0, candidate.priceChange24h) * 0.2 +
      Math.max(0, trendPct) * 0.1 +
      Math.max(0, candleContext.fast.score) * 0.18 +
      Math.max(0, candleContext.swing.score) * 0.12;
    const bullishTechnicalAlignment =
      this.technicalIndicatorsService.isBullish(fastTechnicals, fastKlines.at(-1)?.close ?? candidate.currentPrice) &&
      this.technicalIndicatorsService.isBullish(swingTechnicals, swingKlines.at(-1)?.close ?? candidate.currentPrice);
    const confidence = Math.max(5, Math.min(95, Math.round(score)));
    const strategyScores = this.evaluateStrategies(
      candidate,
      candleContext,
      fastTechnicals,
      swingTechnicals,
      fastKlines,
      swingKlines
    );
    const topStrategy = (Object.entries(strategyScores).sort((a, b) => b[1] - a[1])[0] ?? [
      "none",
      0
    ]) as [TradeStrategy, number];
    const technicalScore = Math.max(-100, Math.min(100, Math.round(candleContext.combinedScore)));
    const reasons = [
      `Selected strategy: ${topStrategy[0]}`,
      `24h volume growth estimate: ${candidate.volumeGrowthPct.toFixed(2)}%`,
      `24h price change: ${candidate.priceChange24h.toFixed(2)}%`,
      `Fast candle pattern: ${candleContext.fast.pattern} on 15m`,
      `15m/1h alignment: ${candleContext.alignment}`,
      `Market regime: ${candleContext.regime}`,
      `Fake breakout risk: ${candleContext.fakeBreakoutRisk}`,
      `RSI 15m/1h: ${fastTechnicals.rsi14.toFixed(2)} / ${swingTechnicals.rsi14.toFixed(2)}`,
      `Combined candle score: ${candleContext.combinedScore.toFixed(2)}`,
      `Trend across sampled candles: ${trendPct.toFixed(2)}%`
    ];
    const riskLevel =
      ["short_reversal", "mean_reversion"].includes(topStrategy[0]) ||
      candidate.marketCap < 100000000 ||
      candleContext.alignment === "mixed"
        ? "high"
        : confidence >= 80
          ? "medium"
          : "low";

    if (
      topStrategy[0] === "breakout" &&
      topStrategy[1] >= 55 &&
      bullishTechnicalAlignment &&
      candleContext.fakeBreakoutRisk === "low"
    ) {
      return this.buildStrategySignal(
        "breakout",
        confidence + 6,
        technicalScore,
        riskLevel,
        "Breakout strategy selected with strong volume expansion, multi-timeframe confirmation and clean structure.",
        reasons,
        "buy"
      );
    }

    if (
      topStrategy[0] === "trend_pullback" &&
      topStrategy[1] >= 48 &&
      candleContext.swing.structure === "bullish" &&
      swingTechnicals.rsi14 >= 50 &&
      candleContext.fakeBreakoutRisk !== "high"
    ) {
      return this.buildStrategySignal(
        "trend_pullback",
        confidence + 3,
        technicalScore,
        riskLevel === "high" ? "medium" : riskLevel,
        "Trend pullback strategy selected after a controlled retracement into dynamic support with bullish higher timeframe bias.",
        reasons,
        "buy"
      );
    }

    if (
      topStrategy[0] === "short_reversal" &&
      topStrategy[1] >= 42 &&
      candleContext.fast.pattern !== "bearish_engulfing"
    ) {
      return this.buildStrategySignal(
        "short_reversal",
        confidence - 6,
        technicalScore - 4,
        "high",
        "Short reversal strategy selected on fast exhaustion and rejection structure; higher risk and faster mean-reversion intent.",
        reasons,
        confidence >= 58 ? "buy" : "hold"
      );
    }

    if (
      topStrategy[0] === "mean_reversion" &&
      topStrategy[1] >= 44 &&
      fastTechnicals.rsi14 <= 42 &&
      candleContext.fast.lowerWickPct >= 26
    ) {
      return this.buildStrategySignal(
        "mean_reversion",
        confidence - 3,
        technicalScore - 2,
        "high",
        "Mean reversion strategy selected after an overstretched move away from the short-term mean with signs of reaction and exhaustion.",
        reasons,
        confidence >= 60 ? "buy" : "hold"
      );
    }

    if (
      topStrategy[0] === "volatility_squeeze" &&
      topStrategy[1] >= 46 &&
      candleContext.fakeBreakoutRisk !== "high" &&
      candleContext.fast.volumeVsAveragePct >= 8
    ) {
      return this.buildStrategySignal(
        "volatility_squeeze",
        confidence + 2,
        technicalScore,
        riskLevel === "high" ? "medium" : riskLevel,
        "Volatility squeeze strategy selected after compression in range and ATR with early expansion, volume confirmation and bullish release.",
        reasons,
        "buy"
      );
    }

    return this.buildStrategySignal(
      "none",
      confidence,
      technicalScore,
      riskLevel,
      "No trade strategy found with enough quality. The bot is preserving capital and waiting for cleaner structure.",
      reasons,
      candleContext.alignment === "bearish" && confidence <= 35 ? "sell" : "hold"
    );
  }

  async analyze(candidate: MarketCandidate, fastKlines: Kline[], swingKlines: Kline[]): Promise<AISignal> {
    const candleContext = this.candleAnalysisService.buildDecisionContext(fastKlines, swingKlines);

    if (!env.OPENAI_API_KEY) {
      return this.heuristicSignal(candidate, fastKlines, swingKlines, candleContext);
    }

    const prompt = {
      candidate,
      candleContext,
      fastTechnicals: this.technicalIndicatorsService.analyze(fastKlines, "15m"),
      swingTechnicals: this.technicalIndicatorsService.analyze(swingKlines, "1h"),
      recentFastKlines: fastKlines.slice(-24),
      recentSwingKlines: swingKlines.slice(-24),
      outputSchema: {
        action: "buy | sell | hold",
        strategy: "breakout | trend_pullback | short_reversal | mean_reversion | volatility_squeeze | none",
        confidence: "integer 0-100",
        riskLevel: "low | medium | high",
        summary: "short rationale",
        reasons: ["array of short reasons"]
      },
      instructions: [
        "You are assisting a crypto trading bot.",
        "Never recommend a trade that ignores downside risk.",
        "You must classify the setup as breakout, trend_pullback, short_reversal, mean_reversion, volatility_squeeze or none.",
        "Prefer hold when confidence is weak or data quality is uncertain.",
        "Return only valid JSON."
      ]
    };

    const response = await fetchJson<ChatCompletionResponse>(env.OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: env.OPENAI_MODEL,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You generate cautious crypto trading signals for an automated system. Always weigh trend, liquidity and risk."
          },
          {
            role: "user",
            content: JSON.stringify(prompt)
          }
        ],
        temperature: 0.2
      })
    });

    try {
      const content = response.choices[0]?.message.content ?? "{}";
      const parsed = JSON.parse(content) as AISignal;
      return {
        action: parsed.action,
        strategy: parsed.strategy ?? "none",
        confidence: Math.max(0, Math.min(100, parsed.confidence)),
        technicalScore:
          typeof parsed.technicalScore === "number"
            ? Math.max(-100, Math.min(100, parsed.technicalScore))
            : Math.max(-100, Math.min(100, Math.round(candleContext.combinedScore))),
        riskLevel: parsed.riskLevel,
        summary: parsed.summary,
        reasons: parsed.reasons ?? []
      };
    } catch {
      return this.heuristicSignal(candidate, fastKlines, swingKlines, candleContext);
    }
  }
}

import { env } from "../config/env";
import { AISignal, CandleDecisionContext, Kline, MarketCandidate } from "../core/types";
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
    const fastPatternBullish = ["breakout", "bullish_engulfing", "continuation", "rejection"].includes(
      candleContext.fast.pattern
    );
    const action =
      candleContext.alignment === "bullish" &&
      fastPatternBullish &&
      bullishTechnicalAlignment &&
      candleContext.fakeBreakoutRisk !== "high" &&
      confidence >= 62
        ? "buy"
        : candleContext.alignment === "bearish" && confidence <= 40
          ? "sell"
          : "hold";

    return {
      action,
      confidence,
      technicalScore: Math.max(-100, Math.min(100, Math.round(candleContext.combinedScore))),
      riskLevel:
        candidate.marketCap < 100000000 || candleContext.alignment === "mixed"
          ? "high"
          : confidence >= 80
            ? "medium"
            : "low",
      summary:
        "Heuristic signal based on short-term candle momentum, higher-timeframe confirmation, volume acceleration and liquidity.",
      reasons: [
        `24h volume growth estimate: ${candidate.volumeGrowthPct.toFixed(2)}%`,
        `24h price change: ${candidate.priceChange24h.toFixed(2)}%`,
        `Fast candle pattern: ${candleContext.fast.pattern} on 15m`,
        `15m/1h alignment: ${candleContext.alignment}`,
        `Market regime: ${candleContext.regime}`,
        `Fake breakout risk: ${candleContext.fakeBreakoutRisk}`,
        `RSI 15m/1h: ${fastTechnicals.rsi14.toFixed(2)} / ${swingTechnicals.rsi14.toFixed(2)}`,
        `Combined candle score: ${candleContext.combinedScore.toFixed(2)}`,
        `Trend across sampled candles: ${trendPct.toFixed(2)}%`
      ]
    };
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
        confidence: "integer 0-100",
        riskLevel: "low | medium | high",
        summary: "short rationale",
        reasons: ["array of short reasons"]
      },
      instructions: [
        "You are assisting a crypto trading bot.",
        "Never recommend a trade that ignores downside risk.",
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

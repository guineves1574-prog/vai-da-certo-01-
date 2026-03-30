import { Kline, RiskSettings } from "../core/types";
import { CandleAnalysisService } from "./candle-analysis.service";
import { TechnicalIndicatorsService } from "./technical-indicators.service";

export class BacktestService {
  constructor(
    private readonly candleAnalysisService = new CandleAnalysisService(),
    private readonly technicalIndicatorsService = new TechnicalIndicatorsService()
  ) {}

  run(klines: Kline[], settings: RiskSettings) {
    let cash = 10000;
    let position:
      | { entry: number; quantity: number; stopLoss: number; takeProfit: number; peak: number; trailingArmed: boolean }
      | null = null;
    let wins = 0;
    let losses = 0;
    let peak = cash;
    let maxDrawdown = 0;
    const pnls: number[] = [];
    let grossProfit = 0;
    let grossLoss = 0;

    for (let i = 60; i < klines.length; i += 1) {
      const window = klines.slice(i - 60, i);
      const last = window.at(-1)!;
      const fastWindow = window.slice(-24);
      const swingWindow = window;
      const candleContext = this.candleAnalysisService.buildDecisionContext(fastWindow, swingWindow);
      const technicals = this.technicalIndicatorsService.analyze(window, "1h");
      const volumeSpike =
        (last.volume /
          Math.max(
            window.slice(0, -1).reduce((sum, candle) => sum + candle.volume, 0) / Math.max(window.length - 1, 1),
            1
          )) *
          100 -
        100;

      if (
        !position &&
        candleContext.alignment === "bullish" &&
        candleContext.fakeBreakoutRisk !== "high" &&
        candleContext.combinedScore > 18 &&
        technicals.rsi14 >= 52 &&
        technicals.rsi14 <= 72 &&
        volumeSpike > settings.minVolumeGrowthPct
      ) {
        const tradeValue = Math.min(settings.baseTradeAmount, (cash * settings.maxPositionSizePct) / 100);
        const slippageMultiplier = 1 + settings.slippagePct / 100;
        const feeMultiplier = 1 + settings.takerFeePct / 100;
        const entry = last.close * slippageMultiplier;
        const quantity = tradeValue / entry;
        const entryCost = quantity * entry * feeMultiplier;
        position = {
          entry,
          quantity,
          stopLoss: entry * (1 - settings.stopLossPct / 100),
          takeProfit: entry * (1 + settings.takeProfitPct / 100),
          peak: entry,
          trailingArmed: false
        };
        cash -= entryCost;
      }

      if (position) {
        position.peak = Math.max(position.peak, last.high);

        if (!position.trailingArmed && last.high >= position.entry * (1 + settings.breakEvenTriggerPct / 100)) {
          position.trailingArmed = true;
          position.stopLoss = Math.max(position.stopLoss, position.entry);
        }

        if (position.trailingArmed) {
          const trailingStop = position.peak * (1 - settings.trailingStopPct / 100);
          position.stopLoss = Math.max(position.stopLoss, trailingStop);
        }

        if (last.low <= position.stopLoss || last.high >= position.takeProfit) {
          const exit = last.low <= position.stopLoss ? position.stopLoss : position.takeProfit;
          const slippedExit = exit * (1 - settings.slippagePct / 100);
          const exitValue = position.quantity * slippedExit * (1 - settings.takerFeePct / 100);
          const pnl = (exit - position.entry) * position.quantity;
          cash += exitValue;
          pnls.push(pnl);
          if (pnl >= 0) {
            wins += 1;
            grossProfit += pnl;
          } else {
            losses += 1;
            grossLoss += Math.abs(pnl);
          }
          position = null;
        }
      }

      peak = Math.max(peak, cash);
      maxDrawdown = Math.max(maxDrawdown, ((peak - cash) / peak) * 100);
    }

    const closedTrades = wins + losses;
    return {
      initialCapital: 10000,
      endingCapital: Number(cash.toFixed(2)),
      pnl: Number((cash - 10000).toFixed(2)),
      winRate: closedTrades === 0 ? 0 : Number(((wins / closedTrades) * 100).toFixed(2)),
      drawdownPct: Number(maxDrawdown.toFixed(2)),
      closedTrades,
      expectancy: Number((averagePnl(pnls)).toFixed(4)),
      profitFactor: grossLoss === 0 ? Number(grossProfit.toFixed(4)) : Number((grossProfit / grossLoss).toFixed(4))
    };
  }
}

function averagePnl(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

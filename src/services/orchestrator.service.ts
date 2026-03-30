import { logger } from "../config/logger";
import { AISignal, MarketCandidate } from "../core/types";
import { query } from "../db/postgres";
import { AIAnalysisService } from "./ai-analysis.service";
import { AlertsService } from "./alerts.service";
import { BotSettingsService } from "./bot-settings.service";
import { MarketDataService } from "./market-data.service";
import { PortfolioService } from "./portfolio.service";
import { RiskService } from "./risk.service";
import { TradingService } from "./trading.service";
import { TechnicalIndicatorsService } from "./technical-indicators.service";

export class OrchestratorService {
  constructor(
    private readonly botSettingsService: BotSettingsService,
    private readonly marketDataService: MarketDataService,
    private readonly aiAnalysisService: AIAnalysisService,
    private readonly riskService: RiskService,
    private readonly portfolioService: PortfolioService,
    private readonly tradingService: TradingService,
    private readonly alertsService: AlertsService,
    private readonly technicalIndicatorsService = new TechnicalIndicatorsService()
  ) {}

  async runCycle(userId: string) {
    const [settings, portfolio] = await Promise.all([
      this.botSettingsService.getSettings(userId),
      this.portfolioService.getSnapshot(userId)
    ]);
    const [cycle] = await query<{ id: string }>(
      "INSERT INTO bot_cycles (user_id) VALUES ($1) RETURNING id",
      [userId]
    );

    try {
      const candidates = await this.marketDataService.getCandidates(
        10,
        settings.minVolumeGrowthPct,
        settings.lowMarketCapLimit
      );

      const selectedCandidates = candidates.filter((candidate) => this.isAllowedByList(settings, candidate));
      const evaluations = await Promise.all(
        selectedCandidates.map(async (candidate) => {
          const [fastKlines, swingKlines] = await Promise.all([
            this.marketDataService.getKlines(candidate.symbol, "15m", 120),
            this.marketDataService.getKlines(candidate.symbol, "1h", 120)
          ]);
          const signal = await this.aiAnalysisService.analyze(candidate, fastKlines, swingKlines);
          return { candidate, signal };
        })
      );

      await this.handleOpenPositions(userId);

      const approved = await this.findFirstApproved(userId, settings, portfolio, evaluations);
      if (!approved) {
        await query("UPDATE bot_cycles SET status = 'COMPLETED', finished_at = NOW(), notes = $2 WHERE id = $1", [
          cycle.id,
          "No approved trades this cycle."
        ]);
        return { message: "No approved trades this cycle.", evaluations };
      }

      const executionPrice = approved.candidate.currentPrice;
      await this.tradingService.execute({
        userId,
        symbol: approved.candidate.symbol,
        orderType: "market",
        side: "BUY",
        quantity: approved.decision.quantity,
        price: executionPrice,
        mode: settings.mode,
        maxSpreadPct: settings.maxSpreadPct,
        aiSignal: {
          ...approved.signal,
          summary: `${approved.signal.summary} ${approved.decision.reason}`.trim(),
          stopLossPrice: approved.decision.stopLossPrice,
          takeProfitPrice: approved.decision.takeProfitPrice
        } as AISignal & { stopLossPrice?: number; takeProfitPrice?: number }
      });

      await query("UPDATE bot_cycles SET status = 'COMPLETED', finished_at = NOW(), notes = $2 WHERE id = $1", [
        cycle.id,
        `Executed ${approved.candidate.symbol}`
      ]);

      await this.alertsService.notify(
        userId,
        "trade_executed",
        `Trade executed in ${settings.mode} mode: BUY ${approved.candidate.symbol} at ${executionPrice.toFixed(6)} with technical score ${approved.signal.technicalScore}`
      );

      return { message: `Executed ${approved.candidate.symbol}`, evaluations };
    } catch (error) {
      await query("UPDATE bot_cycles SET status = 'FAILED', finished_at = NOW(), notes = $2 WHERE id = $1", [
        cycle.id,
        error instanceof Error ? error.message : "Unknown error"
      ]);
      logger.error("Bot cycle failed", { userId, error: error instanceof Error ? error.message : error });
      throw error;
    }
  }

  private isAllowedByList(settings: Awaited<ReturnType<BotSettingsService["getSettings"]>>, candidate: MarketCandidate) {
    if (settings.blacklist.includes(candidate.symbol)) {
      return false;
    }
    if (settings.whitelist.length > 0 && !settings.whitelist.includes(candidate.symbol)) {
      return false;
    }
    return true;
  }

  private async findFirstApproved(
    userId: string,
    settings: Awaited<ReturnType<BotSettingsService["getSettings"]>>,
    portfolio: Awaited<ReturnType<PortfolioService["getSnapshot"]>>,
    evaluations: Array<{ candidate: MarketCandidate; signal: AISignal }>
  ) {
    for (const evaluation of evaluations.sort((a, b) => b.signal.confidence - a.signal.confidence)) {
      const decision = await this.riskService.assessTrade(
        userId,
        settings,
        portfolio,
        evaluation.candidate,
        evaluation.signal
      );

      if (decision.approved) {
        return { ...evaluation, decision };
      }
    }

    return null;
  }

  private async handleOpenPositions(userId: string) {
    const openPositions = await query<{
      id: string;
      symbol: string;
      entry_price: string;
      current_price: string;
      stop_loss_price: string;
      take_profit_price: string;
      peak_price: string;
      trailing_armed: boolean;
    }>(
      `SELECT id, symbol, entry_price, current_price, stop_loss_price, take_profit_price, peak_price, trailing_armed
       FROM positions
       WHERE user_id = $1 AND status = 'OPEN'`,
      [userId]
    );

    const settings = await this.botSettingsService.getSettings(userId);

    for (const position of openPositions) {
      const klines = await this.marketDataService.getKlines(position.symbol, "15m", 40);
      const lastPrice = klines.at(-1)?.close ?? Number(position.current_price);
      const currentPeak = Math.max(Number(position.peak_price || 0), Number(position.entry_price), lastPrice);
      const technicals = this.technicalIndicatorsService.analyze(klines, "15m");
      let newStop = Number(position.stop_loss_price);
      let trailingArmed = position.trailing_armed;

      if (!trailingArmed && lastPrice >= Number(position.entry_price) * (1 + settings.breakEvenTriggerPct / 100)) {
        trailingArmed = true;
        newStop = Math.max(newStop, Number(position.entry_price));
      }

      if (trailingArmed) {
        newStop = Math.max(newStop, currentPeak * (1 - settings.trailingStopPct / 100));
      }

      if (technicals.rsi14 > 78 && lastPrice > Number(position.entry_price)) {
        newStop = Math.max(newStop, lastPrice * 0.9925);
      }

      await query(
        "UPDATE positions SET current_price = $3, peak_price = $4, stop_loss_price = $5, trailing_armed = $6 WHERE id = $1 AND user_id = $2",
        [
          position.id,
          userId,
          lastPrice,
          currentPeak,
          Number(newStop.toFixed(8)),
          trailingArmed
        ]
      );

      if (lastPrice <= Number(newStop)) {
        await this.tradingService.closePosition({
          userId,
          positionId: position.id,
          exitPrice: lastPrice
        });
        await this.alertsService.notify(
          userId,
          "stop_loss",
          `Protective stop triggered for ${position.symbol} at ${lastPrice.toFixed(6)}`
        );
      } else if (lastPrice >= Number(position.take_profit_price)) {
        await this.tradingService.closePosition({
          userId,
          positionId: position.id,
          exitPrice: lastPrice
        });
        await this.alertsService.notify(
          userId,
          "take_profit",
          `Take profit triggered for ${position.symbol} at ${lastPrice.toFixed(6)}`
        );
      }
    }
  }
}

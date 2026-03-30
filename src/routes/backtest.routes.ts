import { Router } from "express";
import { authMiddleware, getAuthenticatedUserId } from "../middleware/auth";
import { AuthService } from "../services/auth.service";
import { BacktestService } from "../services/backtest.service";
import { BotSettingsService } from "../services/bot-settings.service";
import { MarketDataService } from "../services/market-data.service";

export function createBacktestRouter(
  authService: AuthService,
  backtestService: BacktestService,
  botSettingsService: BotSettingsService,
  marketDataService: MarketDataService
) {
  const router = Router();
  router.use(authMiddleware(authService));

  router.post("/", async (req, res, next) => {
    try {
      const userId = getAuthenticatedUserId(req);
      const symbol = String(req.body.symbol ?? "BTCUSDT");
      const interval = String(req.body.interval ?? "1h");
      const limit = Number(req.body.limit ?? 200);
      const settings = await botSettingsService.getSettings(userId);
      const klines = await marketDataService.getKlines(symbol, interval, limit);
      const result = backtestService.run(klines, settings);
      res.json({ symbol, interval, limit, result });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

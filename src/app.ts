import cors from "cors";
import express from "express";
import path from "path";
import { AppError } from "./core/errors";
import { AuthService } from "./services/auth.service";
import { UserService } from "./services/user.service";
import { EncryptionService } from "./services/encryption.service";
import { CredentialsService } from "./services/credentials.service";
import { BotSettingsService } from "./services/bot-settings.service";
import { MarketDataService } from "./services/market-data.service";
import { AIAnalysisService } from "./services/ai-analysis.service";
import { RiskService } from "./services/risk.service";
import { PortfolioService } from "./services/portfolio.service";
import { BinanceService } from "./services/binance.service";
import { TradingService } from "./services/trading.service";
import { AlertsService } from "./services/alerts.service";
import { DashboardService } from "./services/dashboard.service";
import { BacktestService } from "./services/backtest.service";
import { OrchestratorService } from "./services/orchestrator.service";
import { createAuthRouter } from "./routes/auth.routes";
import { createCredentialsRouter } from "./routes/credentials.routes";
import { createBotRouter } from "./routes/bot.routes";
import { createDashboardRouter } from "./routes/dashboard.routes";
import { createBacktestRouter } from "./routes/backtest.routes";

export function createApp() {
  const authService = new AuthService();
  const userService = new UserService(authService);
  const encryptionService = new EncryptionService();
  const credentialsService = new CredentialsService(encryptionService);
  const botSettingsService = new BotSettingsService();
  const marketDataService = new MarketDataService();
  const aiAnalysisService = new AIAnalysisService();
  const riskService = new RiskService();
  const portfolioService = new PortfolioService();
  const binanceService = new BinanceService();
  const tradingService = new TradingService(binanceService, credentialsService, portfolioService);
  const alertsService = new AlertsService();
  const dashboardService = new DashboardService(portfolioService, botSettingsService);
  const backtestService = new BacktestService();
  const orchestratorService = new OrchestratorService(
    botSettingsService,
    marketDataService,
    aiAnalysisService,
    riskService,
    portfolioService,
    tradingService,
    alertsService
  );

  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(express.static(path.join(process.cwd(), "public")));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, mode: "simulation-first" });
  });

  app.use("/api/auth", createAuthRouter(userService, authService));
  app.use("/api/credentials", createCredentialsRouter(authService, credentialsService));
  app.use("/api/bot", createBotRouter(authService, botSettingsService, orchestratorService));
  app.use("/api/dashboard", createDashboardRouter(authService, dashboardService));
  app.use(
    "/api/backtest",
    createBacktestRouter(authService, backtestService, botSettingsService, marketDataService)
  );

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ error: error.message });
    }

    const message = error instanceof Error ? error.message : "Unexpected error";
    return res.status(500).json({ error: message });
  });

  return { app, orchestratorService };
}

import { query } from "../db/postgres";
import { PortfolioService } from "./portfolio.service";
import { BotSettingsService } from "./bot-settings.service";

export class DashboardService {
  constructor(
    private readonly portfolioService: PortfolioService,
    private readonly botSettingsService: BotSettingsService
  ) {}

  async getSummary(userId: string) {
    const [positions, trades, alerts, settings, portfolio] = await Promise.all([
      query(
        `SELECT id, symbol, strategy, quantity, entry_price, current_price, stop_loss_price, take_profit_price, peak_price, trailing_armed, opened_at
         FROM positions
         WHERE user_id = $1 AND status = 'OPEN'
         ORDER BY opened_at DESC`,
        [userId]
      ),
      query(
        `SELECT symbol, strategy, side, order_type, mode, quantity, price, status, ai_signal, ai_confidence, executed_price, executed_quantity, exchange_status, created_at
         FROM trade_orders
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 20`,
        [userId]
      ),
      query(
        `SELECT event_type, message, delivered, created_at
         FROM alerts
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 10`,
        [userId]
      ),
      this.botSettingsService.getSettings(userId),
      this.portfolioService.getSnapshot(userId)
    ]);

    return { settings, portfolio, positions, trades, alerts };
  }
}

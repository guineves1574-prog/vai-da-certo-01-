import { query } from "../db/postgres";
import { PortfolioService } from "./portfolio.service";
import { BotSettingsService } from "./bot-settings.service";

type StrategyMetricRow = {
  strategy: string | null;
  trades: string;
  wins: string;
  losses: string;
  realized_pnl: string;
  avg_pnl: string;
};

type DailyPnlRow = {
  bucket: string;
  pnl: string;
};

export class DashboardService {
  constructor(
    private readonly portfolioService: PortfolioService,
    private readonly botSettingsService: BotSettingsService
  ) {}

  async getSummary(userId: string) {
    const [positions, trades, alerts, settings, portfolio, strategyMetricsRaw, dailyPnlRows] = await Promise.all([
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
      this.portfolioService.getSnapshot(userId),
      query<StrategyMetricRow>(
        `SELECT
           COALESCE(strategy, 'none') AS strategy,
           COUNT(*)::text AS trades,
           COUNT(*) FILTER (WHERE realized_pnl > 0)::text AS wins,
           COUNT(*) FILTER (WHERE realized_pnl <= 0)::text AS losses,
           COALESCE(SUM(realized_pnl), 0)::text AS realized_pnl,
           COALESCE(AVG(realized_pnl), 0)::text AS avg_pnl
         FROM positions
         WHERE user_id = $1
           AND status = 'CLOSED'
         GROUP BY COALESCE(strategy, 'none')
         ORDER BY COALESCE(SUM(realized_pnl), 0) DESC, COUNT(*) DESC`,
        [userId]
      ),
      query<DailyPnlRow>(
        `SELECT
           to_char(date_trunc('day', closed_at), 'YYYY-MM-DD') AS bucket,
           COALESCE(SUM(realized_pnl), 0)::text AS pnl
         FROM positions
         WHERE user_id = $1
           AND status = 'CLOSED'
           AND closed_at >= NOW() - INTERVAL '14 days'
         GROUP BY date_trunc('day', closed_at)
         ORDER BY date_trunc('day', closed_at) ASC`,
        [userId]
      )
    ]);

    const strategyMetrics = strategyMetricsRaw.map((row) => ({
      strategy: row.strategy ?? "none",
      trades: Number(row.trades),
      wins: Number(row.wins),
      losses: Number(row.losses),
      winRate: Number(row.trades) > 0 ? Number(((Number(row.wins) / Number(row.trades)) * 100).toFixed(1)) : 0,
      realizedPnl: Number(row.realized_pnl),
      averagePnl: Number(row.avg_pnl)
    }));

    const totalWindowPnl = dailyPnlRows.reduce((sum, row) => sum + Number(row.pnl), 0);
    let runningEquity = portfolio.cashBalance + portfolio.exposure - totalWindowPnl;
    const equitySeries = dailyPnlRows.map((row) => {
      runningEquity += Number(row.pnl);
      return {
        day: row.bucket,
        pnl: Number(row.pnl),
        equity: Number(runningEquity.toFixed(2))
      };
    });

    return { settings, portfolio, positions, trades, alerts, strategyMetrics, equitySeries };
  }
}

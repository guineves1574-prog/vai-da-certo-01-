import { PortfolioSnapshot } from "../core/types";
import { query } from "../db/postgres";

export class PortfolioService {
  async getSnapshot(userId: string): Promise<PortfolioSnapshot> {
    const [profile] = await query<{ account_balance: string }>(
      "SELECT account_balance FROM user_profiles WHERE user_id = $1",
      [userId]
    );
    const [openAgg] = await query<{ count: string; exposure: string }>(
      `SELECT COUNT(*)::text AS count, COALESCE(SUM(quantity * current_price), 0)::text AS exposure
       FROM positions
       WHERE user_id = $1 AND status = 'OPEN'`,
      [userId]
    );
    const [tradeAgg] = await query<{ pnl: string; count: string }>(
      `SELECT
         COALESCE(SUM(realized_pnl), 0)::text AS pnl,
         COUNT(*)::text AS count
       FROM positions
       WHERE user_id = $1
         AND closed_at >= date_trunc('day', NOW())`,
      [userId]
    );

    return {
      cashBalance: Number(profile?.account_balance ?? 0),
      openPositions: Number(openAgg?.count ?? 0),
      exposure: Number(openAgg?.exposure ?? 0),
      todayRealizedPnl: Number(tradeAgg?.pnl ?? 0),
      todayTrades: Number(tradeAgg?.count ?? 0)
    };
  }

  async adjustCashBalance(userId: string, delta: number) {
    await query(
      "UPDATE user_profiles SET account_balance = account_balance + $2, updated_at = NOW() WHERE user_id = $1",
      [userId, delta]
    );
  }
}

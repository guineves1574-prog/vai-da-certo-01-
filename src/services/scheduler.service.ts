import cron from "node-cron";
import { logger } from "../config/logger";
import { query } from "../db/postgres";
import { OrchestratorService } from "./orchestrator.service";

export class SchedulerService {
  constructor(private readonly orchestratorService: OrchestratorService) {}

  start() {
    cron.schedule("* * * * *", async () => {
      const activeBots = await query<{ user_id: string; analysis_interval_minutes: number }>(
        `SELECT user_id, analysis_interval_minutes
         FROM bot_settings
         WHERE active = TRUE`
      );

      const now = new Date();
      for (const bot of activeBots) {
        if (now.getUTCMinutes() % Math.max(1, bot.analysis_interval_minutes) !== 0) {
          continue;
        }

        try {
          await this.orchestratorService.runCycle(bot.user_id);
        } catch (error) {
          logger.error("Scheduled cycle failed", {
            userId: bot.user_id,
            error: error instanceof Error ? error.message : error
          });
        }
      }
    });
  }
}

import { env } from "./config/env";
import { logger } from "./config/logger";
import { createApp } from "./app";
import { ensureSchemaUpgrades } from "./db/ensure-schema";
import { SchedulerService } from "./services/scheduler.service";

async function bootstrap() {
  await ensureSchemaUpgrades();
  const { app, orchestratorService } = createApp();
  const scheduler = new SchedulerService(orchestratorService);
  scheduler.start();

  app.listen(env.PORT, () => {
    logger.info("Server started", { port: env.PORT });
  });
}

bootstrap().catch((error) => {
  logger.error("Bootstrap failed", { error: error instanceof Error ? error.message : error });
  process.exit(1);
});

import { Router } from "express";
import { AuthService } from "../services/auth.service";
import { BotSettingsService } from "../services/bot-settings.service";
import { OrchestratorService } from "../services/orchestrator.service";
import { authMiddleware, getAuthenticatedUserId } from "../middleware/auth";

export function createBotRouter(
  authService: AuthService,
  botSettingsService: BotSettingsService,
  orchestratorService: OrchestratorService
) {
  const router = Router();
  router.use(authMiddleware(authService));

  router.get("/settings", async (req, res, next) => {
    try {
      const settings = await botSettingsService.getSettings(getAuthenticatedUserId(req));
      res.json(settings);
    } catch (error) {
      next(error);
    }
  });

  router.put("/settings", async (req, res, next) => {
    try {
      const settings = await botSettingsService.upsertSettings(getAuthenticatedUserId(req), req.body);
      res.json(settings);
    } catch (error) {
      next(error);
    }
  });

  router.post("/start", async (req, res, next) => {
    try {
      const settings = await botSettingsService.upsertSettings(getAuthenticatedUserId(req), {
        active: true
      });
      res.json({ status: "started", settings });
    } catch (error) {
      next(error);
    }
  });

  router.post("/stop", async (req, res, next) => {
    try {
      const settings = await botSettingsService.upsertSettings(getAuthenticatedUserId(req), {
        active: false
      });
      res.json({ status: "stopped", settings });
    } catch (error) {
      next(error);
    }
  });

  router.post("/run-once", async (req, res, next) => {
    try {
      const result = await orchestratorService.runCycle(getAuthenticatedUserId(req));
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  return router;
}

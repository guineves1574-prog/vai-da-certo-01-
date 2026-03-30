import { Router } from "express";
import { authMiddleware, getAuthenticatedUserId } from "../middleware/auth";
import { AuthService } from "../services/auth.service";
import { DashboardService } from "../services/dashboard.service";

export function createDashboardRouter(authService: AuthService, dashboardService: DashboardService) {
  const router = Router();
  router.use(authMiddleware(authService));

  router.get("/summary", async (req, res, next) => {
    try {
      const summary = await dashboardService.getSummary(getAuthenticatedUserId(req));
      res.json(summary);
    } catch (error) {
      next(error);
    }
  });

  return router;
}

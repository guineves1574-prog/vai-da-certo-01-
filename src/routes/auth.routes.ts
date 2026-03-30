import { Router } from "express";
import { UserService } from "../services/user.service";
import { authMiddleware, getAuthenticatedUserId } from "../middleware/auth";
import { AuthService } from "../services/auth.service";

export function createAuthRouter(userService: UserService, authService: AuthService) {
  const router = Router();

  router.post("/register", async (req, res, next) => {
    try {
      const result = await userService.register(req.body);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  });

  router.post("/login", async (req, res, next) => {
    try {
      const result = await userService.login(req.body);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.get("/me", authMiddleware(authService), async (req, res, next) => {
    try {
      const user = await userService.getProfile(getAuthenticatedUserId(req));
      res.json(user);
    } catch (error) {
      next(error);
    }
  });

  return router;
}

import { Router } from "express";
import { authMiddleware, getAuthenticatedUserId } from "../middleware/auth";
import { AuthService } from "../services/auth.service";
import { CredentialsService } from "../services/credentials.service";

export function createCredentialsRouter(
  authService: AuthService,
  credentialsService: CredentialsService
) {
  const router = Router();
  router.use(authMiddleware(authService));

  router.put("/:provider", async (req, res, next) => {
    try {
      const result = await credentialsService.upsertCredential(getAuthenticatedUserId(req), {
        provider: req.params.provider,
        apiKey: req.body.apiKey,
        apiSecret: req.body.apiSecret,
        passphrase: req.body.passphrase
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  return router;
}

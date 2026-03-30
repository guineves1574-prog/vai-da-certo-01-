import { NextFunction, Request, Response } from "express";
import { AppError } from "../core/errors";
import { AuthService } from "../services/auth.service";

export interface AuthenticatedRequest extends Request {
  userId: string;
}

export function authMiddleware(authService: AuthService) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return next(new AppError("Missing bearer token", 401));
    }

    try {
      const token = authHeader.replace("Bearer ", "");
      const payload = authService.verifyToken(token);
      (req as AuthenticatedRequest).userId = payload.sub;
      return next();
    } catch {
      return next(new AppError("Invalid token", 401));
    }
  };
}

export function getAuthenticatedUserId(req: Request): string {
  const userId = (req as Partial<AuthenticatedRequest>).userId;
  if (!userId) {
    throw new AppError("Authenticated user context missing", 401);
  }
  return userId;
}

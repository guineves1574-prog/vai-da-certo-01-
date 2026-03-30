import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "../config/env";

export class AuthService {
  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }

  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  signToken(userId: string): string {
    return jwt.sign({ sub: userId }, env.JWT_SECRET, { expiresIn: "7d" });
  }

  verifyToken(token: string): { sub: string } {
    return jwt.verify(token, env.JWT_SECRET) as { sub: string };
  }
}

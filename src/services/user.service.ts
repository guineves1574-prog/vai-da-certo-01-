import { AppError } from "../core/errors";
import { query } from "../db/postgres";
import { AuthService } from "./auth.service";

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  name: string;
}

export class UserService {
  constructor(private readonly authService: AuthService) {}

  async register(input: { email: string; name: string; password: string }) {
    const existing = await query<UserRow>("SELECT * FROM users WHERE email = $1", [input.email]);
    if (existing.length > 0) {
      throw new AppError("Email already registered", 409);
    }

    const passwordHash = await this.authService.hashPassword(input.password);
    const [user] = await query<{ id: string; email: string; name: string }>(
      `INSERT INTO users (email, password_hash, name)
       VALUES ($1, $2, $3)
       RETURNING id, email, name`,
      [input.email, passwordHash, input.name]
    );

    await query(
      "INSERT INTO user_profiles (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING",
      [user.id]
    );
    await query("INSERT INTO bot_settings (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING", [
      user.id
    ]);

    return {
      user,
      token: this.authService.signToken(user.id)
    };
  }

  async login(input: { email: string; password: string }) {
    const [user] = await query<UserRow>("SELECT * FROM users WHERE email = $1", [input.email]);
    if (!user) {
      throw new AppError("Invalid credentials", 401);
    }

    const passwordValid = await this.authService.verifyPassword(input.password, user.password_hash);
    if (!passwordValid) {
      throw new AppError("Invalid credentials", 401);
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      },
      token: this.authService.signToken(user.id)
    };
  }

  async getProfile(userId: string) {
    const [user] = await query<{ id: string; email: string; name: string }>(
      "SELECT id, email, name FROM users WHERE id = $1",
      [userId]
    );
    if (!user) {
      throw new AppError("User not found", 404);
    }
    return user;
  }
}

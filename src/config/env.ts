import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(3000),
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  ENCRYPTION_SECRET: z.string().min(32),
  DEFAULT_MODE: z.enum(["real", "simulation"]).default("simulation"),
  ANALYSIS_INTERVAL_MINUTES: z.coerce.number().int().positive().default(5),
  MAX_CANDIDATES_PER_CYCLE: z.coerce.number().int().positive().default(10),
  COINGECKO_BASE_URL: z.string().url().default("https://api.coingecko.com/api/v3"),
  BINANCE_API_BASE_URL: z.string().url().default("https://api.binance.com"),
  OPENAI_API_URL: z.string().url().default("https://api.openai.com/v1/chat/completions"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-4.1-mini"),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional()
});

export const env = envSchema.parse(process.env);

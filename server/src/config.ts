import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().url().default("postgres://postgres:postgres@localhost:5432/collab"),
  REDIS_URL: z.string().url().default("redis://localhost:6379"),
  JWT_SECRET: z.string().min(8).default("change-me-in-production"),
  EPHEMERAL_TTL_SECONDS: z.coerce.number().int().positive().default(30)
});

export const env = envSchema.parse(process.env);

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const zod_1 = require("zod");
dotenv_1.default.config();
const envSchema = zod_1.z.object({
    PORT: zod_1.z.coerce.number().int().positive().default(4000),
    DATABASE_URL: zod_1.z.string().url().default("postgres://postgres:postgres@localhost:5432/collab"),
    REDIS_URL: zod_1.z.string().url().default("redis://localhost:6379"),
    JWT_SECRET: zod_1.z.string().min(8).default("change-me-in-production"),
    EPHEMERAL_TTL_SECONDS: zod_1.z.coerce.number().int().positive().default(30)
});
exports.env = envSchema.parse(process.env);

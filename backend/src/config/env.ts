import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3000'),
  API_URL: z.string().url().default('http://localhost:3000'),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('7d'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  
  // Optional external APIs
  EBAY_APP_ID: z.string().optional(),
  EBAY_DEV_ID: z.string().optional(),
  EBAY_CERT_ID: z.string().optional(),
  MERCADOLIBRE_CLIENT_ID: z.string().optional(),
  MERCADOLIBRE_CLIENT_SECRET: z.string().optional(),
  PAYPAL_CLIENT_ID: z.string().optional(),
  PAYPAL_CLIENT_SECRET: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  SCRAPERAPI_KEY: z.string().optional(),
});

export const env = envSchema.parse(process.env);

export default env;

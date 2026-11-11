import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  MONGODB_URI: z
    .string()
    .regex(/^mongodb(\+srv)?:\/\//, 'Must be a mongodb:// or mongodb+srv:// URI'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  SESSION_TTL_MINUTES: z.coerce.number().int().min(5).max(24 * 60).default(480),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((s) =>
      s
        .split(',')
        .map((o) => o.trim().replace(/\/$/, ''))
        .filter(Boolean),
    )
    .pipe(z.array(z.url()).min(1)),
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(1),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
  /** Swagger UI at /api/docs. Defaults to on, except in production where it must be enabled explicitly. */
  API_DOCS_ENABLED: z.enum(['true', 'false']).optional(),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    // Report which variables are wrong, never their values.
    const problems = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  if (parsed.data.NODE_ENV === 'production' && parsed.data.BCRYPT_ROUNDS < 10) {
    throw new Error('BCRYPT_ROUNDS must be >= 10 in production');
  }
  return parsed.data;
}

export const env = loadEnv();
export const isProd = env.NODE_ENV === 'production';
export const apiDocsEnabled = env.API_DOCS_ENABLED ? env.API_DOCS_ENABLED === 'true' : !isProd;

import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  APP_URL: z.string().url().default('http://localhost:3000'),
  API_BASE_URL: z.string().url().default('http://localhost:4000'),
  DATABASE_URL: z
    .string()
    .min(1)
    .default('postgresql://postgres:postgres@localhost:5432/stageos?schema=public'),
  READ_DATABASE_URL: z.string().optional(),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
  JWT_ACCESS_SECRET: z.string().min(16).default('change-me-access-key-32-chars'),
  JWT_REFRESH_SECRET: z.string().min(16).default('change-me-refresh-key-32-chars'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),
  JWT_ISSUER: z.string().default('stageos'),
  COOKIE_SECURE: z.coerce.boolean().default(false),
  ENCRYPTION_KEY: z.string().min(32).default('stageos-development-encryption-key-0001'),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_PRO: z.string().optional(),
  STRIPE_PRICE_TOURING_PRO: z.string().optional(),
  S3_ENDPOINT: z.string().url().default('http://localhost:9000'),
  S3_PUBLIC_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().min(3).default('stageos-assets'),
  S3_ACCESS_KEY: z.string().min(1).default('minio'),
  S3_SECRET_KEY: z.string().min(1).default('minio123'),
  S3_FORCE_PATH_STYLE: z.coerce.boolean().default(true),
  FILE_MAX_BYTES: z.coerce.number().int().positive().default(25 * 1024 * 1024),
  RATE_LIMIT_TTL_SECONDS: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(120),
  DEFAULT_RETENTION_DAYS: z.coerce.number().int().positive().default(90),
  GRACE_PERIOD_DAYS: z.coerce.number().int().positive().default(7),
  MOBILE_APP_SCHEME: z.string().default('stageos://')
});

const env = envSchema.parse(process.env);

export const config = {
  nodeEnv: env.NODE_ENV,
  isProd: env.NODE_ENV === 'production',
  port: env.API_PORT,
  appUrl: env.APP_URL,
  apiBaseUrl: env.API_BASE_URL,
  databaseUrl: env.DATABASE_URL,
  readDatabaseUrl: env.READ_DATABASE_URL,
  redisUrl: env.REDIS_URL,
  jwt: {
    accessSecret: env.JWT_ACCESS_SECRET,
    refreshSecret: env.JWT_REFRESH_SECRET,
    accessTtl: env.JWT_ACCESS_TTL,
    refreshTtl: env.JWT_REFRESH_TTL,
    issuer: env.JWT_ISSUER,
    cookieSecure: env.COOKIE_SECURE
  },
  encryptionKey: env.ENCRYPTION_KEY,
  stripe: {
    secretKey: env.STRIPE_SECRET_KEY,
    webhookSecret: env.STRIPE_WEBHOOK_SECRET,
    prices: {
      pro: env.STRIPE_PRICE_PRO,
      touringPro: env.STRIPE_PRICE_TOURING_PRO
    }
  },
  s3: {
    endpoint: env.S3_ENDPOINT,
    publicEndpoint: env.S3_PUBLIC_ENDPOINT ?? env.S3_ENDPOINT,
    region: env.S3_REGION,
    bucket: env.S3_BUCKET,
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
    forcePathStyle: env.S3_FORCE_PATH_STYLE
  },
  limits: {
    fileMaxBytes: env.FILE_MAX_BYTES,
    rateLimitTtlSeconds: env.RATE_LIMIT_TTL_SECONDS,
    rateLimitPerMinute: env.RATE_LIMIT_PER_MINUTE,
    defaultRetentionDays: env.DEFAULT_RETENTION_DAYS,
    gracePeriodDays: env.GRACE_PERIOD_DAYS
  },
  mobile: {
    scheme: env.MOBILE_APP_SCHEME
  }
} as const;

export type StageOsConfig = typeof config;

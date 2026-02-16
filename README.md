# StageOS Monorepo

StageOS is a production-oriented SaaS for band managers and touring acts with offline-first sync, event dossiers, finance workflows, and multi-tenant security controls.

## StageOS Signal Lab app

The deployable StageOS Signal Lab survey app in this workspace is located at `apps/web`.
Setup and deployment instructions are in `apps/web/README.md`.

## Stack

- `apps/api`: NestJS + Prisma + PostgreSQL + Redis + BullMQ + S3 (MinIO local)
- `apps/web`: Next.js (App Router) + TypeScript + TailwindCSS + Supabase JS client
- `apps/mobile`: Expo React Native + SQLite offline store + background sync tasks
- `packages/shared`: shared Zod schemas + inferred types
- `tools/webhook-consumer`: sample webhook consumer

## Quick start (Docker)

1. Copy env:

```bash
cp .env.example .env
```

2. Build and run:

```bash
docker compose up --build
```

3. API docs: `http://localhost:4000/docs`
4. Metrics: `http://localhost:4000/metrics`
5. Web app: `http://localhost:3000`
6. MinIO console: `http://localhost:9001` (`minio` / `minio123`)

## Local (without Docker)

```bash
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm dev
```

## Seeded credentials

- Owner: `owner@stageos.local` / `Passw0rd!`
- Manager: `manager@stageos.local` / `Passw0rd!`
- Accountant: `accountant@stageos.local` / `Passw0rd!`

## Env variables

See `.env.example`. Key values:

- `DATABASE_URL` Postgres connection string
- `REDIS_URL` Redis connection
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`
- `S3_*` MinIO/AWS credentials and bucket settings
- `NEXT_PUBLIC_API_URL` API URL for web app

## Deployment

### Option A: Vercel + Railway

- Deploy `apps/web` to Vercel.
- Deploy `apps/api` to Railway.
- Provision managed Postgres + Redis on Railway.
- Set `NEXT_PUBLIC_API_URL` to Railway API domain, and API `APP_URL` to Vercel domain.

### Option B: AWS ECS

- Build API and Web images and push to ECR.
- Run services on ECS Fargate behind ALB.
- Use RDS Postgres + ElastiCache Redis + S3.
- Configure Secrets Manager for runtime env vars.

## Core security and compliance controls

- Organisation-scoped access enforced in services and guards.
- Soft delete + retention purge job (`retentionDays`, default 90).
- API keys stored hashed and shown once.
- Audit logs avoid secret/token persistence.
- Export/delete endpoints for GDPR/UK operations.

## Notes

- External integrations (DocuSign, Stripe, Google OAuth) are scaffolded with clean extension points.
- PDF generation uses `pdf-lib` (Docker-friendly, no browser deps).
- Offline-first behaviour implemented in mobile sync engine and web PWA cache for key pages.

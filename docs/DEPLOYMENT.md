# StageOS Deployment Guide

This guide covers deployment for:

- Render (free-tier default)
- Railway (optional)
- Fly.io (optional)
- AWS ECS (optional, non-free)

## Free-tier default profile

Use this profile while keeping all hosting/backends on free tiers:

1. Render Web Service: `stageos-api` (`apps/api/Dockerfile`)
2. Render Web Service: `stageos-web` (`apps/web/Dockerfile`)
3. Render Background Worker: `stageos-worker` (`apps/api/Dockerfile`, `node dist/apps/api/src/worker.js`)
4. Render Postgres: free plan
5. Render Key Value (Valkey/Redis): free plan
6. Mail provider: `MAIL_PROVIDER=console` (no paid email provider required in MVP)
7. Billing provider: Stripe env vars left empty unless you intentionally enable billing

## Runtime topology

Deploy StageOS as three stateless services:

1. `api`: NestJS HTTP API (`node dist/apps/api/src/main.js`)
2. `worker`: BullMQ consumer (`node dist/apps/api/src/worker.js`)
3. `web`: Next.js frontend (`node apps/web/server.js`)

Managed dependencies:

- PostgreSQL (primary)
- Redis
- S3-compatible bucket (AWS S3, Cloudflare R2, MinIO, etc.)

Provider manifests are committed in:

- `deploy/fly/`
- `deploy/render/render.yaml`
- `deploy/railway/`
- `deploy/aws/ecs/`
- `deploy/aws/terraform/`

## Required environment variables

Set these in each platform:

- `NODE_ENV=production`
- `API_PORT=4000` (API only)
- `APP_URL=https://<web-domain>`
- `API_BASE_URL=https://<api-domain>`
- `DATABASE_URL=postgresql://...`
- `READ_DATABASE_URL=postgresql://...` (optional read replica)
- `REDIS_URL=redis://...`
- `JWT_ACCESS_SECRET=<32+ chars>`
- `JWT_REFRESH_SECRET=<32+ chars>`
- `JWT_ACCESS_TTL=15m`
- `JWT_REFRESH_TTL=30d`
- `JWT_ISSUER=stageos`
- `COOKIE_SECURE=true`
- `ENCRYPTION_KEY=<32+ chars>`
- `MAIL_PROVIDER=console`
- `MAIL_FROM=noreply@stageos.local`
- `STAFFING_OFFER_EXPIRY_HOURS=12`
- `S3_ENDPOINT=https://...`
- `S3_PUBLIC_ENDPOINT=https://...`
- `S3_REGION=...`
- `S3_BUCKET=stageos-assets`
- `S3_ACCESS_KEY=...`
- `S3_SECRET_KEY=...`
- `S3_FORCE_PATH_STYLE=false` (or `true` for MinIO/R2 path-style)
- `FILE_MAX_BYTES=26214400`
- `RATE_LIMIT_TTL_SECONDS=60`
- `RATE_LIMIT_PER_MINUTE=120`
- `DEFAULT_RETENTION_DAYS=90`
- `GRACE_PERIOD_DAYS=7`
- `QUEUE_PROCESSOR_ENABLED=false` on API service
- `QUEUE_PROCESSOR_ENABLED=true` on worker service
- `QUEUE_WEBHOOK_CONCURRENCY=10`
- `MOBILE_APP_SCHEME=stageos://`
- `NEXT_PUBLIC_API_URL=https://<api-domain>/api` (web only)
- `STRIPE_SECRET_KEY=...` (if billing enabled)
- `STRIPE_WEBHOOK_SECRET=...`
- `STRIPE_PRICE_PRO=...`
- `STRIPE_PRICE_TOURING_PRO=...`

## Database migrations

Run migrations during each deploy before traffic cutover:

```bash
corepack pnpm --filter @stageos/api exec prisma migrate deploy --schema prisma/schema.prisma
```

One-click option in GitHub Actions:

- Run `.github/workflows/migrate-database.yml`
- Choose `staging` or `production`
- Ensure environment-scoped `DATABASE_URL` secret is configured
- Environment secret matrix: `docs/GITHUB_ENVIRONMENTS.md`

Fastest staging path (free profile):

- Run `.github/workflows/staging-one-click.yml`
- It builds and pushes images, optionally runs migrations, triggers Render deploy hooks, and runs optional smoke checks

Recommended before first staging cut:

- Run `.github/workflows/staging-preflight.yml`
- It validates required Render hook secrets and endpoint reachability

## Railway

1. Create a Railway project.
2. Provision PostgreSQL + Redis plugins.
3. Create three services from repo:
   - API service: Dockerfile `apps/api/Dockerfile`, start command `node dist/apps/api/src/main.js`.
   - Worker service: Dockerfile `apps/api/Dockerfile`, start command `node dist/apps/api/src/worker.js`.
   - Web service: Dockerfile `apps/web/Dockerfile`.
4. Set service env vars listed above.
5. Add a pre-deploy migration command (or one-off job) for Prisma migrate deploy.
6. Map custom domains for API and web.

Use committed service configs:

- `deploy/railway/api.railway.toml`
- `deploy/railway/worker.railway.toml`
- `deploy/railway/web.railway.toml`

## Fly.io

Use separate Fly apps (`stageos-api`, `stageos-worker`, `stageos-web`):

```bash
fly launch --name stageos-api --no-deploy
fly launch --name stageos-worker --no-deploy
fly launch --name stageos-web --no-deploy
```

Deploy commands:

```bash
fly deploy --app stageos-api --dockerfile apps/api/Dockerfile
fly deploy --app stageos-worker --dockerfile apps/api/Dockerfile --command "node dist/apps/api/src/worker.js"
fly deploy --app stageos-web --dockerfile apps/web/Dockerfile
```

Attach managed Postgres/Redis/S3-compatible credentials via Fly secrets.

Use committed Fly configs:

- `deploy/fly/api.fly.toml`
- `deploy/fly/worker.fly.toml`
- `deploy/fly/web.fly.toml`

## Render

Create services:

1. Web service (`apps/api/Dockerfile`, start `node dist/apps/api/src/main.js`, health `/api/health`, plan `free`)
2. Web service (`apps/web/Dockerfile`, plan `free`)
3. Background worker (`apps/api/Dockerfile`, command `node dist/apps/api/src/worker.js`, plan `free`)
4. Managed Postgres database (plan `free`)
5. Managed Key Value (Valkey/Redis) instance (plan `free`)

Set all env vars in each service and run Prisma migrations as a deploy hook or one-off job.

Use committed Render blueprint:

- `deploy/render/render.yaml`

## AWS ECS (Fargate, optional/non-free)

Recommended layout:

- ECS cluster with three services (`stageos-api`, `stageos-worker`, `stageos-web`)
- ALB routing:
  - `/api/*` and `/docs` -> API target group
  - `/` -> web target group
- RDS PostgreSQL (Multi-AZ)
- ElastiCache Redis
- S3 bucket + KMS encryption + lifecycle policies
- Secrets Manager for runtime secrets
- CloudWatch logs and metrics alarms

Deployment flow:

1. Build/push images to ECR (or GHCR mirrored to ECR).
2. Run `.github/workflows/deploy-ecs.yml` with target environment and image URIs.
3. Workflow registers task definition revisions and performs rolling service updates.
4. Optionally execute Prisma migrations in the same run (`run_migrations=true`).

Use committed ECS task definitions:

- `deploy/aws/ecs/taskdef-api.json`
- `deploy/aws/ecs/taskdef-worker.json`
- `deploy/aws/ecs/taskdef-web.json`

Terraform option (recommended for repeatable infra):

- `deploy/aws/terraform/README.md`
- `deploy/aws/terraform/terraform.tfvars.example`

## GitHub Actions pipelines

- `.github/workflows/ci.yml`: validation gates and docker build verification
- `.github/workflows/deploy-staging.yml`: publishes staging images to GHCR
- `.github/workflows/deploy-production.yml`: publishes production images to GHCR
- `.github/workflows/migrate-database.yml`: one-click migration deploy for staging/production
- `.github/workflows/release-gates.yml`: go-live hardening gates (quality, migration readiness, image scan, terraform validate)
- `.github/workflows/deploy-ecs.yml`: rolling ECS deploy with optional migration execution
- `.github/workflows/staging-one-click.yml`: single-run staging release (build/push + migrate + deploy + smoke)
- `.github/workflows/staging-preflight.yml`: staging secret/infra endpoint preflight

Each deployment platform can be configured to auto-rollout when new GHCR tags are published.

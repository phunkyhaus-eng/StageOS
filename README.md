# StageOS

Production-ready SaaS operating system for professional bands, touring acts, and managers.

StageOS is built as an offline-first, multi-tenant platform centered on the **Event Dossier** and ships with:

- Event operations (roster, timeline, setlists, notes, files, travel, settlement)
- Booking CRM pipeline and availability workflow with conflict detection
- Finance module (invoices, expenses, payouts, exports, profit analytics)
- File hub with S3-compatible storage, version tracking, and signed URLs
- Tour routing with profitability scoring
- Stripe subscription engine with tier gating and usage metering
- RBAC + 2FA + device sessions + immutable audit logs
- Analytics aggregation layer and diagnostics dashboard
- Plugin framework with hook execution sandboxing
- White-label branding profiles per organisation
- Web PWA + mobile (Expo) with shared offline business logic

## Free-tier mode (default for now)

StageOS is currently configured to run with free hosting/backends by default:

- Render free web service for `stageos-api`
- Render free web service for `stageos-web`
- Render free background worker for `stageos-worker`
- Render free Postgres
- Render free Key Value (Valkey/Redis)
- `MAIL_PROVIDER=console` (email actions logged to server output in non-production mail mode)
- Stripe keys optional and disabled unless explicitly configured

## Monorepo structure

```text
stageOS/
├─ apps/
│  ├─ api/                  # NestJS API, Prisma schema/migrations, queues, auth, billing
│  ├─ web/                  # Next.js App Router frontend + PWA
│  └─ mobile/               # Expo app (React Native) + SQLite sync queue
├─ packages/
│  └─ shared/               # Shared schemas + offline conflict/merge utilities
├─ .github/workflows/       # CI + staging image publish + production image publish
├─ deploy/                  # Provider manifests (Railway, Fly.io, Render, ECS)
├─ docker-compose.yml       # Local full stack (db, redis, object storage, api, worker, web)
└─ tools/                   # Repo checks/utilities
```

Full tree reference: `docs/FOLDER_STRUCTURE.md`

## Tech stack

- Frontend: Next.js, TypeScript, TailwindCSS, React Query, Zustand, PWA
- Mobile: Expo React Native + shared TypeScript business logic
- Backend: NestJS, Prisma, PostgreSQL, Redis, BullMQ, S3-compatible object storage
- Infra: Docker, Docker Compose, GitHub Actions

## Local setup

1. Install dependencies:

```bash
corepack pnpm install
```

2. Create env file:

```bash
cp .env.example .env
```

3. Start infrastructure and apps:

```bash
docker compose up --build
```

4. Run migrations and seed data (new terminal):

```bash
corepack pnpm db:migrate
corepack pnpm db:seed
```

## Local URLs

- Web: `http://localhost:3000`
- API: `http://localhost:4000/api`
- Swagger docs: `http://localhost:4000/docs`
- Prometheus metrics: `http://localhost:4000/metrics`
- MinIO console: `http://localhost:9001` (`minio` / `minio123`)

## Key commands

```bash
# dev
corepack pnpm dev
corepack pnpm dev:worker

# quality gates
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test:unit
corepack pnpm test:integration
corepack pnpm test:e2e

# build
corepack pnpm build
```

## Calendar workflow (band operations)

- Open `/events` for Day/Week/Month/Agenda views.
- Click empty cells/timeline to quick-create entries; drag events to move; drag bottom handle to resize.
- Use event types for band workflows:
  - `GIG`, `REHEARSAL`, `TRAVEL`, `HOLD`, `PROMO`, `RECORDING`, `DEADLINE`.
- Use booking statuses for hold funnel and fulfillment:
  - `HOLD`, `TENTATIVE`, `CONFIRMED`, `COMPLETED`, `CANCELLED` (plus legacy `PLANNED` compatibility).
- In event edit modal:
  - GIG: fill call-sheet fields (venue/map, client, contacts, timing blocks, lineup/deps, attachment references).
  - REHEARSAL: objective, required lineup, location, duration.
  - TRAVEL: origin/destination, depart/arrive, travel notes.
- Availability:
  - Create an availability request from the event modal.
  - Set per-member availability (`AVAILABLE/YES`, `MAYBE`, `UNAVAILABLE/NO`) and optional reason.
- Conflict interpretation:
  - Warning badges indicate unavailable members, double-bookings, and travel overlaps.
  - Conflict details appear inside the event modal under **Conflicts**.

## CI/CD

- `CI` workflow:
  - lint + typecheck
  - API unit/integration tests
  - Playwright e2e tests
  - Docker image build validation
- `Deploy Staging` workflow:
  - builds and pushes `stageos-api` + `stageos-web` images to GHCR with staging tags
- `Deploy Production` workflow:
  - manual release image publish to GHCR with production/release tags
- `Deploy Database Migrations` workflow:
  - one-click `prisma migrate deploy` for staging/production
- `Release Gates` workflow:
  - quality checks + migration readiness + container vuln scanning + terraform validation
- `Deploy ECS` workflow:
  - optional migration run + rolling ECS deployment for API/web/worker
- `Staging One-Click Release` workflow:
  - build/push staging images + optional migrations + Render deploy hooks + optional smoke checks
- `Staging Preflight` workflow:
  - validates staging Render secrets + endpoint reachability before release

## Deployment

Deployment runbooks for Railway, Fly.io, Render, and AWS ECS are in:

- `docs/DEPLOYMENT.md`
- `docs/RELEASE_CHECKLIST.md`
- `docs/GITHUB_ENVIRONMENTS.md`

## Security and compliance highlights

- JWT auth + refresh rotation + TOTP 2FA
- RBAC permission middleware across modules
- Financial field encryption
- Immutable audit log records
- Signed URL file access and upload scan policy
- GDPR export and account deletion workflow
- Retention and backup policy endpoints

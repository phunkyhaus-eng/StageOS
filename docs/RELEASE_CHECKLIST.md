# StageOS Release Checklist

Use this checklist before promoting StageOS to production.

## 1) Change freeze and versioning

- Create release tag with date and semantic version (`vX.Y.Z` + date suffix).
- Freeze schema changes after migration window approval.
- Confirm rollback image tags exist for API and web.

## 2) Mandatory quality gates

- `corepack pnpm lint` passes.
- `corepack pnpm -r typecheck` passes.
- `corepack pnpm test:unit` passes.
- `corepack pnpm test:integration` passes.
- `corepack pnpm build` passes.
- `Release Gates` GitHub workflow passes.

## 3) Migration safety

- `Deploy Database Migrations` workflow executed for target environment.
- `prisma migrate status` reports database in sync.
- Migration runtime tested against a staging snapshot.
- Backout plan documented for each migration.

## 4) Security hardening gates

- Trivy scan reports no `CRITICAL` or `HIGH` vulnerabilities in API/web images.
- JWT and encryption secrets rotated within last 90 days.
- RBAC regression check completed on Owner/Manager/Member/Crew/Accountant paths.
- Signed URL and file upload scan behavior validated.
- TOTP setup/login/recovery smoke tests pass.
- Audit log write path verified for auth + financial + plugin actions.

## 5) Data and backup gates

- RDS automated backups enabled and retention >= 7 days.
- Backup restore test completed in last 30 days.
- S3 bucket versioning + encryption enabled.
- Retention purge job observed in non-production.
- GDPR export and account deletion flows tested.

## 6) Observability and operations gates

- `/api/health` and `/metrics` healthy in staging and production.
- Queue depth and failed jobs dashboard reviewed.
- Error tracking sink confirms ingestion from API/web.
- Alerting policies active for API latency, 5xx rate, queue failures, and DB CPU.
- On-call handoff includes release notes and rollback instructions.

## 7) Deployment execution

- Publish production images from `Deploy Production` workflow.
- Run `Deploy Database Migrations` for `production`.
- Roll API service, then worker service, then web service.
- Run post-deploy smoke:
  - Auth login + refresh
  - Event dossier create/edit
  - Availability request/respond
  - Setlist lock + export
  - Invoice PDF generation
  - File upload/download signed URL
  - Webhook delivery

## 8) Post-release verification

- Compare P95 latency and error budget against baseline.
- Review Stripe webhook success rate.
- Validate analytics aggregation job completed.
- Verify no spike in IP anomaly logs or auth failures.

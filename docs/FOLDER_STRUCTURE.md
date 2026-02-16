# StageOS Folder Structure

```text
stageOS
├─ apps
│  ├─ api
│  │  ├─ prisma
│  │  │  ├─ migrations
│  │  │  │  ├─ 0001_init/migration.sql
│  │  │  │  └─ migration_lock.toml
│  │  │  ├─ schema.prisma
│  │  │  └─ seed.ts
│  │  ├─ src
│  │  │  ├─ analytics
│  │  │  ├─ auth
│  │  │  ├─ availability
│  │  │  ├─ billing
│  │  │  ├─ branding
│  │  │  ├─ calendar
│  │  │  ├─ common
│  │  │  ├─ compliance
│  │  │  ├─ diagnostics
│  │  │  ├─ events
│  │  │  ├─ feature-flags
│  │  │  ├─ files
│  │  │  ├─ finance
│  │  │  ├─ health
│  │  │  ├─ leads
│  │  │  ├─ metrics
│  │  │  ├─ plugins
│  │  │  ├─ prisma
│  │  │  ├─ public-api
│  │  │  ├─ queue
│  │  │  ├─ rbac
│  │  │  ├─ setlists
│  │  │  ├─ songs
│  │  │  ├─ sync
│  │  │  ├─ tours
│  │  │  ├─ users
│  │  │  ├─ app.module.ts
│  │  │  ├─ config.ts
│  │  │  ├─ main.ts
│  │  │  ├─ worker.module.ts
│  │  │  └─ worker.ts
│  │  ├─ test
│  │  │  ├─ setlist-merge.spec.ts
│  │  │  └─ sync.controller.integration.spec.ts
│  │  ├─ Dockerfile
│  │  └─ package.json
│  ├─ mobile
│  │  ├─ src
│  │  │  ├─ hooks/use-sync.ts
│  │  │  ├─ lib/api.ts
│  │  │  ├─ lib/offline-db.ts
│  │  │  └─ store/app-store.ts
│  │  ├─ App.tsx
│  │  └─ package.json
│  └─ web
│     ├─ app
│     │  ├─ (app)
│     │  │  ├─ analytics/page.tsx
│     │  │  ├─ availability/page.tsx
│     │  │  ├─ crm/page.tsx
│     │  │  ├─ dashboard/page.tsx
│     │  │  ├─ events/page.tsx
│     │  │  ├─ files/page.tsx
│     │  │  ├─ finance/page.tsx
│     │  │  ├─ setlists/page.tsx
│     │  │  ├─ settings/page.tsx
│     │  │  ├─ tours/page.tsx
│     │  │  └─ layout.tsx
│     │  ├─ offline/page.tsx
│     │  ├─ globals.css
│     │  ├─ layout.tsx
│     │  └─ page.tsx
│     ├─ components
│     │  ├─ providers
│     │  ├─ shell
│     │  └─ ui
│     ├─ e2e/dashboard.spec.ts
│     ├─ lib
│     │  ├─ hooks
│     │  ├─ offline
│     │  ├─ state
│     │  ├─ api-client.ts
│     │  └─ config.ts
│     ├─ public
│     │  ├─ icons
│     │  ├─ manifest.webmanifest
│     │  └─ sw.js
│     ├─ Dockerfile
│     ├─ next.config.mjs
│     ├─ playwright.config.ts
│     └─ package.json
├─ docs
│  ├─ DEPLOYMENT.md
│  ├─ FOLDER_STRUCTURE.md
│  ├─ GITHUB_ENVIRONMENTS.md
│  └─ RELEASE_CHECKLIST.md
├─ deploy
│  ├─ aws/ecs
│  │  ├─ taskdef-api.json
│  │  ├─ taskdef-web.json
│  │  └─ taskdef-worker.json
│  ├─ aws/terraform
│  │  ├─ README.md
│  │  ├─ alb.tf
│  │  ├─ data-services.tf
│  │  ├─ ecs.tf
│  │  ├─ iam.tf
│  │  ├─ locals.tf
│  │  ├─ network.tf
│  │  ├─ outputs.tf
│  │  ├─ secrets.tf
│  │  ├─ security.tf
│  │  ├─ storage.tf
│  │  ├─ terraform.tfvars.example
│  │  ├─ variables.tf
│  │  └─ versions.tf
│  ├─ fly
│  │  ├─ api.fly.toml
│  │  ├─ web.fly.toml
│  │  └─ worker.fly.toml
│  ├─ railway
│  │  ├─ api.railway.toml
│  │  ├─ web.railway.toml
│  │  └─ worker.railway.toml
│  ├─ render/render.yaml
│  ├─ secrets
│  │  ├─ production.secrets.example
│  │  └─ staging.secrets.example
│  └─ README.md
├─ packages
│  └─ shared
│     ├─ src
│     │  ├─ index.ts
│     │  ├─ offline.ts
│     │  └─ schemas.ts
│     └─ package.json
├─ .github
│  └─ workflows
│     ├─ ci.yml
│     ├─ deploy-staging.yml
│     ├─ deploy-production.yml
│     ├─ deploy-ecs.yml
│     ├─ migrate-database.yml
│     ├─ staging-one-click.yml
│     ├─ staging-preflight.yml
│     └─ release-gates.yml
├─ docker-compose.yml
├─ package.json
└─ README.md
```

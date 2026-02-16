# StageOS Deployment Manifests

This directory contains platform-ready deployment manifests:

- `deploy/fly/*`: Fly.io app configs for API, worker, and web
- `deploy/render/render.yaml`: Render blueprint
- `deploy/railway/*.railway.toml`: Railway service configs
- `deploy/aws/ecs/*.json`: ECS Fargate task definitions
- `deploy/aws/terraform/*`: Terraform stack (ECS, ALB, RDS, Redis, S3, Secrets Manager)

All manifests assume this service split:

1. API (`node dist/apps/api/src/main.js`)
2. Worker (`node dist/apps/api/src/worker.js`)
3. Web (`node apps/web/server.js`)

Use the environment variable contract in:

- `/.env.example`
- `/docs/DEPLOYMENT.md`
- `/docs/GITHUB_ENVIRONMENTS.md`

Deployment helper scripts:

- `/tools/ecs_rollout.sh`
- `/tools/smoke_check.sh`
- `/tools/check_required_env.sh`
- `/tools/set_github_env_secrets.sh`

Secrets templates:

- `/deploy/secrets/staging.secrets.example`
- `/deploy/secrets/production.secrets.example`

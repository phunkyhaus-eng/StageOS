# GitHub Environments Setup

Configure two GitHub environments in the repository:

- `staging`
- `production`

Recommended protection rules:

- required reviewers for `production`
- branch restrictions (`main` and release branches)
- wait timer for production if your process requires it

## Secret matrix

Set these as **environment secrets** for both `staging` and `production` unless marked optional.

| Secret | Required by | Description |
| --- | --- | --- |
| `DATABASE_URL` | `migrate-database.yml`, `release-gates.yml`, `deploy-ecs.yml` (when `run_migrations=true`) | Target Postgres connection string for Prisma migrate. |
| `AWS_REGION` | `deploy-ecs.yml` | AWS region (for example `us-east-1`). |
| `AWS_DEPLOY_ROLE_ARN` | `deploy-ecs.yml` | IAM role ARN for GitHub OIDC deployment auth. |
| `ECS_CLUSTER_NAME` | `deploy-ecs.yml` | ECS cluster name to deploy into. |
| `ECS_API_SERVICE_NAME` | `deploy-ecs.yml` | ECS service name for StageOS API. |
| `ECS_WEB_SERVICE_NAME` | `deploy-ecs.yml` | ECS service name for StageOS web app. |
| `ECS_WORKER_SERVICE_NAME` | `deploy-ecs.yml` | ECS service name for StageOS worker. |
| `STAGING_WEB_BASE_URL` | `staging-one-click.yml` (optional if smoke checks enabled) | Staging web URL (for example `https://staging.stageos.app`). |
| `STAGING_API_BASE_URL` | `staging-one-click.yml` (optional if smoke checks enabled) | Staging API base URL (for example `https://api-staging.stageos.app`). |

## OIDC trust policy baseline

`AWS_DEPLOY_ROLE_ARN` should trust GitHub OIDC and restrict repo/ref scope. Example condition keys:

- `token.actions.githubusercontent.com:aud = sts.amazonaws.com`
- `token.actions.githubusercontent.com:sub` scoped to this repo and allowed refs/environments

Grant this role least-privilege access for:

- `ecs:DescribeServices`, `ecs:DescribeTaskDefinition`, `ecs:RegisterTaskDefinition`, `ecs:UpdateService`
- `iam:PassRole` (execution/task roles used in task definitions)
- `logs:*` read where needed
- `secretsmanager:GetSecretValue` only if required by deployment path

## Workflow-to-environment mapping

- `deploy-staging.yml` -> environment `staging`
- `deploy-production.yml` -> environment `production`
- `migrate-database.yml` -> selected `target_env`
- `release-gates.yml` -> selected `target_env`
- `deploy-ecs.yml` -> selected `target_env`
- `staging-one-click.yml` -> environment `staging`
- `staging-preflight.yml` -> environment `staging`

## Example values

### staging

- `DATABASE_URL=postgresql://stageos:***@staging-db.example:5432/stageos?schema=public`
- `AWS_REGION=us-east-1`
- `AWS_DEPLOY_ROLE_ARN=arn:aws:iam::<account-id>:role/stageos-staging-github-deploy`
- `ECS_CLUSTER_NAME=stageos-staging-cluster`
- `ECS_API_SERVICE_NAME=stageos-staging-api`
- `ECS_WEB_SERVICE_NAME=stageos-staging-web`
- `ECS_WORKER_SERVICE_NAME=stageos-staging-worker`

### production

- `DATABASE_URL=postgresql://stageos:***@prod-db.example:5432/stageos?schema=public`
- `AWS_REGION=us-east-1`
- `AWS_DEPLOY_ROLE_ARN=arn:aws:iam::<account-id>:role/stageos-production-github-deploy`
- `ECS_CLUSTER_NAME=stageos-production-cluster`
- `ECS_API_SERVICE_NAME=stageos-production-api`
- `ECS_WEB_SERVICE_NAME=stageos-production-web`
- `ECS_WORKER_SERVICE_NAME=stageos-production-worker`

## Fast setup with GitHub CLI

1. Copy templates to local files:

```bash
cp deploy/secrets/staging.secrets.example deploy/secrets/staging.secrets.local
cp deploy/secrets/production.secrets.example deploy/secrets/production.secrets.local
```

2. Fill in real values in `*.local` files.

3. Push secrets:

```bash
tools/set_github_env_secrets.sh staging deploy/secrets/staging.secrets.local
tools/set_github_env_secrets.sh production deploy/secrets/production.secrets.local
```

Optional: target a specific repo explicitly:

```bash
tools/set_github_env_secrets.sh staging deploy/secrets/staging.secrets.local your-org/your-repo
```

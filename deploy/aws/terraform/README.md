# StageOS AWS Terraform

Provisioning scope:

- VPC, subnets, routing, optional NAT
- Application Load Balancer (web + API path routing)
- ECS Fargate cluster and services (`api`, `web`, `worker`)
- RDS PostgreSQL
- ElastiCache Redis
- S3 assets bucket (versioned + encrypted)
- Secrets Manager runtime/database secrets
- IAM roles and CloudWatch log groups

## Usage

1. Copy variables:

```bash
cp terraform.tfvars.example terraform.tfvars
```

2. Update `terraform.tfvars` with image tags and secrets.

3. Run Terraform:

```bash
terraform init
terraform plan
terraform apply
```

## Cost profile

Default values are tuned for lower-cost staging:

- no NAT gateway
- single-task ECS services
- `db.t4g.micro` and `cache.t4g.micro`

For hardened production:

- set `create_nat_gateway=true`
- set `launch_in_private_subnets=true`
- set `db_multi_az=true`
- provide `acm_certificate_arn`

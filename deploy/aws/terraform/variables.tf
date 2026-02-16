variable "project_name" {
  description = "Project identifier used in resource names."
  type        = string
  default     = "stageos"
}

variable "environment" {
  description = "Deployment environment."
  type        = string
  default     = "staging"
}

variable "aws_region" {
  description = "AWS region for the deployment."
  type        = string
  default     = "us-east-1"
}

variable "vpc_cidr" {
  description = "VPC CIDR block."
  type        = string
  default     = "10.42.0.0/16"
}

variable "az_count" {
  description = "Number of availability zones to use."
  type        = number
  default     = 2

  validation {
    condition     = var.az_count >= 2 && var.az_count <= 3
    error_message = "az_count must be between 2 and 3."
  }
}

variable "create_nat_gateway" {
  description = "Whether to create a NAT gateway for private subnet egress."
  type        = bool
  default     = false
}

variable "launch_in_private_subnets" {
  description = "Run ECS tasks in private subnets. Requires NAT enabled for outbound internet access."
  type        = bool
  default     = false

  validation {
    condition     = !(var.launch_in_private_subnets && !var.create_nat_gateway)
    error_message = "launch_in_private_subnets=true requires create_nat_gateway=true."
  }
}

variable "api_desired_count" {
  description = "Desired API service task count."
  type        = number
  default     = 1
}

variable "web_desired_count" {
  description = "Desired web service task count."
  type        = number
  default     = 1
}

variable "worker_desired_count" {
  description = "Desired worker service task count."
  type        = number
  default     = 1
}

variable "api_image" {
  description = "Container image for API and worker tasks."
  type        = string
  default     = "ghcr.io/ORG/REPO/stageos-api:production"
}

variable "web_image" {
  description = "Container image for web tasks."
  type        = string
  default     = "ghcr.io/ORG/REPO/stageos-web:production"
}

variable "api_cpu" {
  description = "CPU units for API task definition."
  type        = number
  default     = 1024
}

variable "api_memory" {
  description = "Memory (MiB) for API task definition."
  type        = number
  default     = 2048
}

variable "web_cpu" {
  description = "CPU units for web task definition."
  type        = number
  default     = 512
}

variable "web_memory" {
  description = "Memory (MiB) for web task definition."
  type        = number
  default     = 1024
}

variable "worker_cpu" {
  description = "CPU units for worker task definition."
  type        = number
  default     = 512
}

variable "worker_memory" {
  description = "Memory (MiB) for worker task definition."
  type        = number
  default     = 1024
}

variable "db_name" {
  description = "Primary PostgreSQL database name."
  type        = string
  default     = "stageos"
}

variable "db_username" {
  description = "Primary PostgreSQL username."
  type        = string
  default     = "stageos"
}

variable "db_instance_class" {
  description = "RDS instance class."
  type        = string
  default     = "db.t4g.micro"
}

variable "db_allocated_storage" {
  description = "RDS allocated storage in GiB."
  type        = number
  default     = 20
}

variable "db_max_allocated_storage" {
  description = "RDS max autoscaled storage in GiB."
  type        = number
  default     = 100
}

variable "db_backup_retention_days" {
  description = "RDS automated backup retention."
  type        = number
  default     = 7
}

variable "db_multi_az" {
  description = "Enable RDS Multi-AZ."
  type        = bool
  default     = false
}

variable "deletion_protection" {
  description = "Enable deletion protection for data services."
  type        = bool
  default     = true
}

variable "skip_final_snapshot" {
  description = "Skip final snapshot on RDS destroy."
  type        = bool
  default     = false
}

variable "redis_node_type" {
  description = "ElastiCache node type."
  type        = string
  default     = "cache.t4g.micro"
}

variable "redis_cluster_size" {
  description = "Number of cache nodes in the replication group."
  type        = number
  default     = 1
}

variable "redis_snapshot_retention_limit" {
  description = "ElastiCache snapshot retention in days."
  type        = number
  default     = 1
}

variable "acm_certificate_arn" {
  description = "Optional ACM certificate ARN for TLS listener."
  type        = string
  default     = ""
}

variable "web_domain" {
  description = "Optional web domain (without protocol)."
  type        = string
  default     = ""
}

variable "api_domain" {
  description = "Optional API domain (without protocol)."
  type        = string
  default     = ""
}

variable "stripe_secret_key" {
  description = "Stripe secret key."
  type        = string
  default     = ""
  sensitive   = true
}

variable "stripe_webhook_secret" {
  description = "Stripe webhook signing secret."
  type        = string
  default     = ""
  sensitive   = true
}

variable "stripe_price_pro" {
  description = "Stripe price ID for Pro tier."
  type        = string
  default     = ""
}

variable "stripe_price_touring_pro" {
  description = "Stripe price ID for Touring Pro tier."
  type        = string
  default     = ""
}

variable "s3_access_key" {
  description = "S3 access key for StageOS runtime."
  type        = string
  sensitive   = true
}

variable "s3_secret_key" {
  description = "S3 secret key for StageOS runtime."
  type        = string
  sensitive   = true
}

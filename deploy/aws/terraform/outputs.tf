output "alb_dns_name" {
  description = "ALB DNS name."
  value       = aws_lb.stageos.dns_name
}

output "assets_bucket_name" {
  description = "S3 bucket for StageOS file assets."
  value       = aws_s3_bucket.assets.bucket
}

output "database_endpoint" {
  description = "PostgreSQL endpoint hostname."
  value       = aws_db_instance.postgres.address
}

output "redis_primary_endpoint" {
  description = "Redis primary endpoint hostname."
  value       = aws_elasticache_replication_group.redis.primary_endpoint_address
}

output "ecs_cluster_name" {
  description = "ECS cluster name."
  value       = aws_ecs_cluster.main.name
}

output "api_service_name" {
  description = "ECS API service name."
  value       = aws_ecs_service.api.name
}

output "web_service_name" {
  description = "ECS web service name."
  value       = aws_ecs_service.web.name
}

output "worker_service_name" {
  description = "ECS worker service name."
  value       = aws_ecs_service.worker.name
}

output "runtime_secret_arn" {
  description = "Secrets Manager ARN for runtime config."
  value       = aws_secretsmanager_secret.runtime.arn
}

output "database_secret_arn" {
  description = "Secrets Manager ARN for database/redis URLs."
  value       = aws_secretsmanager_secret.database.arn
}

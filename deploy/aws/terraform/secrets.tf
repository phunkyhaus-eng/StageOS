locals {
  web_origin = var.web_domain != "" ? "https://${var.web_domain}" : "http://${aws_lb.stageos.dns_name}"
  api_origin = var.api_domain != "" ? "https://${var.api_domain}" : "http://${aws_lb.stageos.dns_name}"
}

resource "random_password" "jwt_access" {
  length  = 48
  special = false
}

resource "random_password" "jwt_refresh" {
  length  = 48
  special = false
}

resource "random_password" "encryption_key" {
  length  = 48
  special = false
}

resource "aws_secretsmanager_secret" "runtime" {
  name = "${local.name_prefix}/runtime"

  tags = local.common_tags
}

resource "aws_secretsmanager_secret_version" "runtime" {
  secret_id = aws_secretsmanager_secret.runtime.id
  secret_string = jsonencode({
    APP_URL                  = local.web_origin
    API_BASE_URL             = local.api_origin
    JWT_ACCESS_SECRET        = random_password.jwt_access.result
    JWT_REFRESH_SECRET       = random_password.jwt_refresh.result
    JWT_ISSUER               = "stageos"
    COOKIE_SECURE            = "true"
    ENCRYPTION_KEY           = random_password.encryption_key.result
    STRIPE_SECRET_KEY        = var.stripe_secret_key
    STRIPE_WEBHOOK_SECRET    = var.stripe_webhook_secret
    STRIPE_PRICE_PRO         = var.stripe_price_pro
    STRIPE_PRICE_TOURING_PRO = var.stripe_price_touring_pro
    S3_ENDPOINT              = "https://s3.${var.aws_region}.amazonaws.com"
    S3_PUBLIC_ENDPOINT       = "https://s3.${var.aws_region}.amazonaws.com"
    S3_REGION                = var.aws_region
    S3_BUCKET                = aws_s3_bucket.assets.bucket
    S3_ACCESS_KEY            = var.s3_access_key
    S3_SECRET_KEY            = var.s3_secret_key
    S3_FORCE_PATH_STYLE      = "false"
    FILE_MAX_BYTES           = "26214400"
    RATE_LIMIT_TTL_SECONDS   = "60"
    RATE_LIMIT_PER_MINUTE    = "120"
    DEFAULT_RETENTION_DAYS   = "90"
    GRACE_PERIOD_DAYS        = "7"
    MOBILE_APP_SCHEME        = "stageos://"
    NEXT_PUBLIC_API_URL      = "${local.api_origin}/api"
  })
}

resource "aws_secretsmanager_secret" "database" {
  name = "${local.name_prefix}/database"

  tags = local.common_tags
}

resource "aws_secretsmanager_secret_version" "database" {
  secret_id = aws_secretsmanager_secret.database.id
  secret_string = jsonencode({
    DATABASE_URL      = "postgresql://${var.db_username}:${random_password.db_master.result}@${aws_db_instance.postgres.address}:${aws_db_instance.postgres.port}/${var.db_name}?schema=public"
    READ_DATABASE_URL = "postgresql://${var.db_username}:${random_password.db_master.result}@${aws_db_instance.postgres.address}:${aws_db_instance.postgres.port}/${var.db_name}?schema=public"
    REDIS_URL         = "rediss://:${random_password.redis_auth.result}@${aws_elasticache_replication_group.redis.primary_endpoint_address}:6379"
  })
}

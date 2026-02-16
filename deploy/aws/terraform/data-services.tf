resource "random_password" "db_master" {
  length  = 32
  special = false
}

resource "aws_db_subnet_group" "main" {
  name       = "${local.name_prefix}-db-subnets"
  subnet_ids = aws_subnet.private[*].id

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-db-subnets"
  })
}

resource "aws_db_instance" "postgres" {
  identifier                     = "${local.name_prefix}-postgres"
  engine                         = "postgres"
  engine_version                 = "16.3"
  instance_class                 = var.db_instance_class
  db_name                        = var.db_name
  username                       = var.db_username
  password                       = random_password.db_master.result
  allocated_storage              = var.db_allocated_storage
  max_allocated_storage          = var.db_max_allocated_storage
  backup_retention_period        = var.db_backup_retention_days
  storage_encrypted              = true
  multi_az                       = var.db_multi_az
  publicly_accessible            = false
  deletion_protection            = var.deletion_protection
  skip_final_snapshot            = var.skip_final_snapshot
  final_snapshot_identifier      = var.skip_final_snapshot ? null : "${local.name_prefix}-postgres-final"
  db_subnet_group_name           = aws_db_subnet_group.main.name
  vpc_security_group_ids         = [aws_security_group.rds.id]
  auto_minor_version_upgrade     = true
  performance_insights_enabled   = true
  performance_insights_retention_period = 7

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-postgres"
  })
}

resource "random_password" "redis_auth" {
  length  = 32
  special = false
}

resource "aws_elasticache_subnet_group" "main" {
  name       = "${local.name_prefix}-redis-subnets"
  subnet_ids = aws_subnet.private[*].id
}

resource "aws_elasticache_replication_group" "redis" {
  replication_group_id          = replace("${local.name_prefix}-redis", "_", "-")
  description                   = "StageOS Redis for queueing and caching"
  node_type                     = var.redis_node_type
  num_cache_clusters            = var.redis_cluster_size
  engine                        = "redis"
  engine_version                = "7.1"
  port                          = 6379
  subnet_group_name             = aws_elasticache_subnet_group.main.name
  security_group_ids            = [aws_security_group.redis.id]
  automatic_failover_enabled    = var.redis_cluster_size > 1
  multi_az_enabled              = var.redis_cluster_size > 1
  at_rest_encryption_enabled    = true
  transit_encryption_enabled    = true
  auth_token                    = random_password.redis_auth.result
  snapshot_retention_limit      = var.redis_snapshot_retention_limit
  apply_immediately             = true

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-redis"
  })
}

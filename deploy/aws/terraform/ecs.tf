resource "aws_cloudwatch_log_group" "api" {
  name              = "/ecs/${local.name_prefix}-api"
  retention_in_days = 30

  tags = local.common_tags
}

resource "aws_cloudwatch_log_group" "web" {
  name              = "/ecs/${local.name_prefix}-web"
  retention_in_days = 30

  tags = local.common_tags
}

resource "aws_cloudwatch_log_group" "worker" {
  name              = "/ecs/${local.name_prefix}-worker"
  retention_in_days = 30

  tags = local.common_tags
}

resource "aws_ecs_cluster" "main" {
  name = "${local.name_prefix}-cluster"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = local.common_tags
}

resource "aws_ecs_task_definition" "api" {
  family                   = "${local.name_prefix}-api"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = tostring(var.api_cpu)
  memory                   = tostring(var.api_memory)
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name      = "stageos-api"
      image     = var.api_image
      essential = true
      portMappings = [
        {
          containerPort = 4000
          protocol      = "tcp"
        }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.api.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "ecs"
        }
      }
      environment = [
        { name = "NODE_ENV", value = "production" },
        { name = "API_PORT", value = "4000" },
        { name = "QUEUE_PROCESSOR_ENABLED", value = "false" }
      ]
      secrets = [
        { name = "APP_URL", valueFrom = "${aws_secretsmanager_secret.runtime.arn}:APP_URL::" },
        { name = "API_BASE_URL", valueFrom = "${aws_secretsmanager_secret.runtime.arn}:API_BASE_URL::" },
        { name = "DATABASE_URL", valueFrom = "${aws_secretsmanager_secret.database.arn}:DATABASE_URL::" },
        { name = "READ_DATABASE_URL", valueFrom = "${aws_secretsmanager_secret.database.arn}:READ_DATABASE_URL::" },
        { name = "REDIS_URL", valueFrom = "${aws_secretsmanager_secret.database.arn}:REDIS_URL::" },
        { name = "JWT_ACCESS_SECRET", valueFrom = "${aws_secretsmanager_secret.runtime.arn}:JWT_ACCESS_SECRET::" },
        { name = "JWT_REFRESH_SECRET", valueFrom = "${aws_secretsmanager_secret.runtime.arn}:JWT_REFRESH_SECRET::" },
        { name = "JWT_ISSUER", valueFrom = "${aws_secretsmanager_secret.runtime.arn}:JWT_ISSUER::" },
        { name = "COOKIE_SECURE", valueFrom = "${aws_secretsmanager_secret.runtime.arn}:COOKIE_SECURE::" },
        { name = "ENCRYPTION_KEY", valueFrom = "${aws_secretsmanager_secret.runtime.arn}:ENCRYPTION_KEY::" },
        { name = "STRIPE_SECRET_KEY", valueFrom = "${aws_secretsmanager_secret.runtime.arn}:STRIPE_SECRET_KEY::" },
        { name = "STRIPE_WEBHOOK_SECRET", valueFrom = "${aws_secretsmanager_secret.runtime.arn}:STRIPE_WEBHOOK_SECRET::" },
        { name = "STRIPE_PRICE_PRO", valueFrom = "${aws_secretsmanager_secret.runtime.arn}:STRIPE_PRICE_PRO::" },
        { name = "STRIPE_PRICE_TOURING_PRO", valueFrom = "${aws_secretsmanager_secret.runtime.arn}:STRIPE_PRICE_TOURING_PRO::" },
        { name = "S3_ENDPOINT", valueFrom = "${aws_secretsmanager_secret.runtime.arn}:S3_ENDPOINT::" },
        { name = "S3_PUBLIC_ENDPOINT", valueFrom = "${aws_secretsmanager_secret.runtime.arn}:S3_PUBLIC_ENDPOINT::" },
        { name = "S3_REGION", valueFrom = "${aws_secretsmanager_secret.runtime.arn}:S3_REGION::" },
        { name = "S3_BUCKET", valueFrom = "${aws_secretsmanager_secret.runtime.arn}:S3_BUCKET::" },
        { name = "S3_ACCESS_KEY", valueFrom = "${aws_secretsmanager_secret.runtime.arn}:S3_ACCESS_KEY::" },
        { name = "S3_SECRET_KEY", valueFrom = "${aws_secretsmanager_secret.runtime.arn}:S3_SECRET_KEY::" },
        { name = "S3_FORCE_PATH_STYLE", valueFrom = "${aws_secretsmanager_secret.runtime.arn}:S3_FORCE_PATH_STYLE::" },
        { name = "FILE_MAX_BYTES", valueFrom = "${aws_secretsmanager_secret.runtime.arn}:FILE_MAX_BYTES::" },
        { name = "RATE_LIMIT_TTL_SECONDS", valueFrom = "${aws_secretsmanager_secret.runtime.arn}:RATE_LIMIT_TTL_SECONDS::" },
        { name = "RATE_LIMIT_PER_MINUTE", valueFrom = "${aws_secretsmanager_secret.runtime.arn}:RATE_LIMIT_PER_MINUTE::" },
        { name = "DEFAULT_RETENTION_DAYS", valueFrom = "${aws_secretsmanager_secret.runtime.arn}:DEFAULT_RETENTION_DAYS::" },
        { name = "GRACE_PERIOD_DAYS", valueFrom = "${aws_secretsmanager_secret.runtime.arn}:GRACE_PERIOD_DAYS::" },
        { name = "MOBILE_APP_SCHEME", valueFrom = "${aws_secretsmanager_secret.runtime.arn}:MOBILE_APP_SCHEME::" }
      ]
    }
  ])

  tags = local.common_tags
}

resource "aws_ecs_task_definition" "web" {
  family                   = "${local.name_prefix}-web"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = tostring(var.web_cpu)
  memory                   = tostring(var.web_memory)
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name      = "stageos-web"
      image     = var.web_image
      essential = true
      portMappings = [
        {
          containerPort = 3000
          protocol      = "tcp"
        }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.web.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "ecs"
        }
      }
      environment = [
        { name = "NODE_ENV", value = "production" },
        { name = "PORT", value = "3000" }
      ]
      secrets = [
        { name = "NEXT_PUBLIC_API_URL", valueFrom = "${aws_secretsmanager_secret.runtime.arn}:NEXT_PUBLIC_API_URL::" }
      ]
    }
  ])

  tags = local.common_tags
}

resource "aws_ecs_task_definition" "worker" {
  family                   = "${local.name_prefix}-worker"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = tostring(var.worker_cpu)
  memory                   = tostring(var.worker_memory)
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name      = "stageos-worker"
      image     = var.api_image
      essential = true
      command   = ["node", "dist/apps/api/src/worker.js"]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.worker.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "ecs"
        }
      }
      environment = [
        { name = "NODE_ENV", value = "production" },
        { name = "QUEUE_PROCESSOR_ENABLED", value = "true" },
        { name = "QUEUE_WEBHOOK_CONCURRENCY", value = "10" }
      ]
      secrets = [
        { name = "APP_URL", valueFrom = "${aws_secretsmanager_secret.runtime.arn}:APP_URL::" },
        { name = "API_BASE_URL", valueFrom = "${aws_secretsmanager_secret.runtime.arn}:API_BASE_URL::" },
        { name = "DATABASE_URL", valueFrom = "${aws_secretsmanager_secret.database.arn}:DATABASE_URL::" },
        { name = "READ_DATABASE_URL", valueFrom = "${aws_secretsmanager_secret.database.arn}:READ_DATABASE_URL::" },
        { name = "REDIS_URL", valueFrom = "${aws_secretsmanager_secret.database.arn}:REDIS_URL::" },
        { name = "JWT_ACCESS_SECRET", valueFrom = "${aws_secretsmanager_secret.runtime.arn}:JWT_ACCESS_SECRET::" },
        { name = "JWT_REFRESH_SECRET", valueFrom = "${aws_secretsmanager_secret.runtime.arn}:JWT_REFRESH_SECRET::" },
        { name = "JWT_ISSUER", valueFrom = "${aws_secretsmanager_secret.runtime.arn}:JWT_ISSUER::" },
        { name = "COOKIE_SECURE", valueFrom = "${aws_secretsmanager_secret.runtime.arn}:COOKIE_SECURE::" },
        { name = "ENCRYPTION_KEY", valueFrom = "${aws_secretsmanager_secret.runtime.arn}:ENCRYPTION_KEY::" },
        { name = "S3_ENDPOINT", valueFrom = "${aws_secretsmanager_secret.runtime.arn}:S3_ENDPOINT::" },
        { name = "S3_PUBLIC_ENDPOINT", valueFrom = "${aws_secretsmanager_secret.runtime.arn}:S3_PUBLIC_ENDPOINT::" },
        { name = "S3_REGION", valueFrom = "${aws_secretsmanager_secret.runtime.arn}:S3_REGION::" },
        { name = "S3_BUCKET", valueFrom = "${aws_secretsmanager_secret.runtime.arn}:S3_BUCKET::" },
        { name = "S3_ACCESS_KEY", valueFrom = "${aws_secretsmanager_secret.runtime.arn}:S3_ACCESS_KEY::" },
        { name = "S3_SECRET_KEY", valueFrom = "${aws_secretsmanager_secret.runtime.arn}:S3_SECRET_KEY::" },
        { name = "S3_FORCE_PATH_STYLE", valueFrom = "${aws_secretsmanager_secret.runtime.arn}:S3_FORCE_PATH_STYLE::" },
        { name = "FILE_MAX_BYTES", valueFrom = "${aws_secretsmanager_secret.runtime.arn}:FILE_MAX_BYTES::" },
        { name = "RATE_LIMIT_TTL_SECONDS", valueFrom = "${aws_secretsmanager_secret.runtime.arn}:RATE_LIMIT_TTL_SECONDS::" },
        { name = "RATE_LIMIT_PER_MINUTE", valueFrom = "${aws_secretsmanager_secret.runtime.arn}:RATE_LIMIT_PER_MINUTE::" },
        { name = "DEFAULT_RETENTION_DAYS", valueFrom = "${aws_secretsmanager_secret.runtime.arn}:DEFAULT_RETENTION_DAYS::" },
        { name = "GRACE_PERIOD_DAYS", valueFrom = "${aws_secretsmanager_secret.runtime.arn}:GRACE_PERIOD_DAYS::" },
        { name = "MOBILE_APP_SCHEME", valueFrom = "${aws_secretsmanager_secret.runtime.arn}:MOBILE_APP_SCHEME::" }
      ]
    }
  ])

  tags = local.common_tags
}

resource "aws_ecs_service" "api" {
  name            = "${local.name_prefix}-api"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = var.api_desired_count
  launch_type     = "FARGATE"

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  network_configuration {
    subnets          = local.ecs_subnet_ids
    assign_public_ip = local.ecs_assign_public_ip
    security_groups  = [aws_security_group.ecs.id]
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "stageos-api"
    container_port   = 4000
  }

  depends_on = [aws_lb_listener.http]

  tags = local.common_tags
}

resource "aws_ecs_service" "web" {
  name            = "${local.name_prefix}-web"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.web.arn
  desired_count   = var.web_desired_count
  launch_type     = "FARGATE"

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  network_configuration {
    subnets          = local.ecs_subnet_ids
    assign_public_ip = local.ecs_assign_public_ip
    security_groups  = [aws_security_group.ecs.id]
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.web.arn
    container_name   = "stageos-web"
    container_port   = 3000
  }

  depends_on = [aws_lb_listener.http]

  tags = local.common_tags
}

resource "aws_ecs_service" "worker" {
  name            = "${local.name_prefix}-worker"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.worker.arn
  desired_count   = var.worker_desired_count
  launch_type     = "FARGATE"

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  network_configuration {
    subnets          = local.ecs_subnet_ids
    assign_public_ip = local.ecs_assign_public_ip
    security_groups  = [aws_security_group.ecs.id]
  }

  tags = local.common_tags
}

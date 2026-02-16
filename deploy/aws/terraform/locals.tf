data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  name_prefix = "${var.project_name}-${var.environment}"
  azs         = slice(data.aws_availability_zones.available.names, 0, var.az_count)

  common_tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }

  ecs_subnet_ids      = var.launch_in_private_subnets ? aws_subnet.private[*].id : aws_subnet.public[*].id
  ecs_assign_public_ip = var.launch_in_private_subnets ? false : true
}

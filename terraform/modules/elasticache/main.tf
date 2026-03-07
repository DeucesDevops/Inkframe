# ─── Auth token stored in Secrets Manager ────────────────────────────────────

resource "random_password" "redis_auth" {
  length  = 32
  special = false # Redis AUTH token must not contain certain special chars
}

resource "aws_secretsmanager_secret" "redis" {
  name                    = "${var.name}/elasticache/auth-token"
  description             = "ElastiCache Redis auth token for ${var.name}"
  recovery_window_in_days = 7

  tags = var.tags
}

resource "aws_secretsmanager_secret_version" "redis" {
  secret_id     = aws_secretsmanager_secret.redis.id
  secret_string = jsonencode({
    auth_token = random_password.redis_auth.result
    url        = "redis://:${random_password.redis_auth.result}@${aws_elasticache_replication_group.this.primary_endpoint_address}:6379"
  })
}

# ─── Subnet Group ────────────────────────────────────────────────────────────

resource "aws_elasticache_subnet_group" "this" {
  name        = "${var.name}-redis-subnet-group"
  description = "ElastiCache subnet group for ${var.name}"
  subnet_ids  = var.private_subnet_ids

  tags = var.tags
}

# ─── Security Group ──────────────────────────────────────────────────────────

resource "aws_security_group" "redis" {
  name        = "${var.name}-redis-sg"
  description = "Allow Redis access from EKS nodes"
  vpc_id      = var.vpc_id

  ingress {
    description     = "Redis from EKS nodes"
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [var.node_security_group_id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow all outbound"
  }

  tags = merge(var.tags, { Name = "${var.name}-redis-sg" })
}

# ─── Parameter Group ─────────────────────────────────────────────────────────

resource "aws_elasticache_parameter_group" "this" {
  name        = "${var.name}-redis7"
  family      = "redis7"
  description = "Custom Redis parameter group for ${var.name}"

  parameter {
    name  = "maxmemory-policy"
    value = "allkeys-lru"
  }

  tags = var.tags
}

# ─── Replication Group (cluster-mode disabled, multi-AZ) ─────────────────────

resource "aws_elasticache_replication_group" "this" {
  replication_group_id = "${var.name}-redis"
  description          = "Redis cluster for ${var.name} (BullMQ queues + session cache)"

  engine               = "redis"
  engine_version       = var.redis_version
  node_type            = var.redis_node_type
  num_cache_clusters   = var.redis_num_cache_nodes
  parameter_group_name = aws_elasticache_parameter_group.this.name
  port                 = 6379

  subnet_group_name  = aws_elasticache_subnet_group.this.name
  security_group_ids = [aws_security_group.redis.id]

  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  auth_token                 = random_password.redis_auth.result

  automatic_failover_enabled = var.redis_num_cache_nodes > 1
  multi_az_enabled           = var.redis_num_cache_nodes > 1

  auto_minor_version_upgrade = true
  maintenance_window         = "sun:05:00-sun:06:00"
  snapshot_retention_limit   = 3
  snapshot_window            = "03:00-04:00"

  log_delivery_configuration {
    destination      = aws_cloudwatch_log_group.redis_slow.name
    destination_type = "cloudwatch-logs"
    log_format       = "text"
    log_type         = "slow-log"
  }

  log_delivery_configuration {
    destination      = aws_cloudwatch_log_group.redis_engine.name
    destination_type = "cloudwatch-logs"
    log_format       = "text"
    log_type         = "engine-log"
  }

  tags = merge(var.tags, { Name = "${var.name}-redis" })
}

# ─── CloudWatch Log Groups ───────────────────────────────────────────────────

resource "aws_cloudwatch_log_group" "redis_slow" {
  name              = "/aws/elasticache/${var.name}/slow-log"
  retention_in_days = 14

  tags = var.tags
}

resource "aws_cloudwatch_log_group" "redis_engine" {
  name              = "/aws/elasticache/${var.name}/engine-log"
  retention_in_days = 14

  tags = var.tags
}

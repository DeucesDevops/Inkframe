output "redis_primary_endpoint" {
  description = "Primary endpoint address of the Redis replication group"
  value       = aws_elasticache_replication_group.this.primary_endpoint_address
}

output "redis_port" {
  description = "Redis port"
  value       = 6379
}

output "redis_secret_arn" {
  description = "ARN of the Secrets Manager secret containing the Redis auth token and URL"
  value       = aws_secretsmanager_secret.redis.arn
}

output "redis_security_group_id" {
  description = "Security group ID attached to the Redis cluster"
  value       = aws_security_group.redis.id
}

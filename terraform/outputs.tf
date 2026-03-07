# ─── VPC ─────────────────────────────────────────────────────────────────────

output "vpc_id" {
  description = "VPC ID"
  value       = module.vpc.vpc_id
}

output "private_subnet_ids" {
  description = "Private subnet IDs"
  value       = module.vpc.private_subnet_ids
}

output "public_subnet_ids" {
  description = "Public subnet IDs"
  value       = module.vpc.public_subnet_ids
}

# ─── EKS ─────────────────────────────────────────────────────────────────────

output "eks_cluster_name" {
  description = "EKS cluster name"
  value       = module.eks.cluster_name
}

output "eks_cluster_endpoint" {
  description = "EKS cluster API endpoint"
  value       = module.eks.cluster_endpoint
  sensitive   = true
}

output "eks_cluster_certificate_authority_data" {
  description = "Base64-encoded cluster CA certificate"
  value       = module.eks.cluster_certificate_authority_data
  sensitive   = true
}

output "eks_oidc_issuer_url" {
  description = "OIDC issuer URL for the EKS cluster"
  value       = module.eks.cluster_oidc_issuer_url
}

output "configure_kubectl" {
  description = "Command to configure kubectl for this cluster"
  value       = "aws eks update-kubeconfig --region ${var.aws_region} --name ${module.eks.cluster_name}"
}

# ─── RDS ─────────────────────────────────────────────────────────────────────

output "rds_endpoint" {
  description = "RDS PostgreSQL endpoint"
  value       = module.rds.db_instance_endpoint
  sensitive   = true
}

output "rds_secret_arn" {
  description = "ARN of the Secrets Manager secret with RDS credentials"
  value       = module.rds.db_secret_arn
}

# ─── Redis ───────────────────────────────────────────────────────────────────

output "redis_primary_endpoint" {
  description = "ElastiCache Redis primary endpoint"
  value       = module.elasticache.redis_primary_endpoint
  sensitive   = true
}

output "redis_secret_arn" {
  description = "ARN of the Secrets Manager secret with Redis auth token"
  value       = module.elasticache.redis_secret_arn
}

# ─── ECR ─────────────────────────────────────────────────────────────────────

output "ecr_repository_urls" {
  description = "ECR repository URLs keyed by service name"
  value       = module.ecr.repository_urls
}

output "cluster_name" {
  description = "EKS cluster name"
  value       = aws_eks_cluster.this.name
}

output "cluster_endpoint" {
  description = "EKS cluster API endpoint"
  value       = aws_eks_cluster.this.endpoint
}

output "cluster_certificate_authority_data" {
  description = "Base64-encoded cluster CA certificate"
  value       = aws_eks_cluster.this.certificate_authority[0].data
}

output "cluster_oidc_issuer_url" {
  description = "OIDC issuer URL for the cluster"
  value       = aws_eks_cluster.this.identity[0].oidc[0].issuer
}

output "oidc_provider_arn" {
  description = "ARN of the OIDC provider"
  value       = aws_iam_openid_connect_provider.eks.arn
}

output "node_security_group_id" {
  description = "Security group ID attached to worker nodes"
  value       = aws_security_group.nodes.id
}

output "alb_controller_role_arn" {
  description = "IAM role ARN for the AWS Load Balancer Controller"
  value       = aws_iam_role.alb_controller.arn
}

output "cluster_autoscaler_role_arn" {
  description = "IAM role ARN for the Cluster Autoscaler"
  value       = aws_iam_role.cluster_autoscaler.arn
}

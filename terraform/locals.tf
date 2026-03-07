data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  name   = "${var.project_name}-${var.environment}"
  region = var.aws_region

  # Use provided AZs or fall back to the first 3 available in the region
  azs = length(var.availability_zones) > 0 ? var.availability_zones : slice(
    data.aws_availability_zones.available.names, 0,
    min(3, length(data.aws_availability_zones.available.names))
  )

  common_tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }

  # EKS cluster name exposed as a convenience
  cluster_name = "${local.name}-eks"
}

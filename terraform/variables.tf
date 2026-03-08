variable "aws_region" {
  description = "AWS region for all resources"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Project name used for resource naming and tagging"
  type        = string
  default     = "inkframe"
}

variable "environment" {
  description = "Deployment environment (production, staging)"
  type        = string
  default     = "production"

  validation {
    condition     = contains(["production", "staging", "development"], var.environment)
    error_message = "Environment must be one of: production, staging, development."
  }
}

# ─── VPC ─────────────────────────────────────────────────────────────────────

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  description = "List of availability zones to use (leave empty to auto-select)"
  type        = list(string)
  default     = []
}

variable "private_subnet_cidrs" {
  description = "CIDR blocks for private subnets (one per AZ)"
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
}

variable "public_subnet_cidrs" {
  description = "CIDR blocks for public subnets (one per AZ)"
  type        = list(string)
  default     = ["10.0.101.0/24", "10.0.102.0/24", "10.0.103.0/24"]
}

# ─── EKS ─────────────────────────────────────────────────────────────────────

variable "kubernetes_version" {
  description = "Kubernetes version for the EKS cluster"
  type        = string
  default     = "1.30"
}

variable "node_groups" {
  description = "EKS managed node group configurations"
  type = map(object({
    instance_types = list(string)
    min_size       = number
    max_size       = number
    desired_size   = number
    disk_size      = number
    capacity_type  = string # ON_DEMAND or SPOT
  }))
  default = {
    general = {
      instance_types = ["t3.medium"]
      min_size       = 2
      max_size       = 6
      desired_size   = 2
      disk_size      = 50
      capacity_type  = "ON_DEMAND"
    }
    spot = {
      instance_types = ["t3.large", "t3a.large", "m5.large"]
      min_size       = 0
      max_size       = 10
      desired_size   = 2
      disk_size      = 50
      capacity_type  = "SPOT"
    }
  }
}

variable "cluster_endpoint_public_access_cidrs" {
  description = "CIDRs allowed to reach the EKS public API endpoint"
  type        = list(string)
  default     = ["0.0.0.0/0"] # Restrict in production
}

# ─── RDS ─────────────────────────────────────────────────────────────────────

variable "db_name" {
  description = "Initial database name"
  type        = string
  default     = "inkframe"
}

variable "db_username" {
  description = "Master database username"
  type        = string
  default     = "inkframe_admin"
  sensitive   = true
}

variable "db_instance_class" {
  description = "RDS instance type"
  type        = string
  default     = "db.t3.medium"
}

variable "db_allocated_storage" {
  description = "Initial storage in GiB"
  type        = number
  default     = 20
}

variable "db_max_allocated_storage" {
  description = "Maximum storage autoscaling can grow to (GiB)"
  type        = number
  default     = 100
}

variable "db_backup_retention_days" {
  description = "Days to retain automated backups"
  type        = number
  default     = 7
}

variable "db_multi_az" {
  description = "Enable Multi-AZ for the RDS instance"
  type        = bool
  default     = true
}

variable "db_deletion_protection" {
  description = "Prevent accidental deletion of the RDS instance"
  type        = bool
  default     = true
}

# ─── ElastiCache ─────────────────────────────────────────────────────────────

variable "redis_node_type" {
  description = "ElastiCache node type"
  type        = string
  default     = "cache.t3.small"
}

variable "redis_num_cache_nodes" {
  description = "Number of cache nodes in the cluster"
  type        = number
  default     = 2
}

variable "redis_version" {
  description = "Redis engine version"
  type        = string
  default     = "7.1"
}

# ─── ACM / Domain ────────────────────────────────────────────────────────────

variable "domain_name" {
  description = "Primary domain name for the application (e.g. inkframe.io)"
  type        = string
  default     = ""
}

variable "create_acm_certificate" {
  description = "Create an ACM certificate for the domain"
  type        = bool
  default     = false
}

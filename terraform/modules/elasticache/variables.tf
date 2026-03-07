variable "name" {
  description = "Name prefix for all ElastiCache resources"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID"
  type        = string
}

variable "private_subnet_ids" {
  description = "Private subnet IDs for the ElastiCache subnet group"
  type        = list(string)
}

variable "node_security_group_id" {
  description = "Security group ID of EKS worker nodes"
  type        = string
}

variable "redis_node_type" {
  type    = string
  default = "cache.t3.small"
}

variable "redis_num_cache_nodes" {
  type    = number
  default = 2
}

variable "redis_version" {
  type    = string
  default = "7.1"
}

variable "tags" {
  type    = map(string)
  default = {}
}

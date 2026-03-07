variable "name" {
  description = "Name prefix for all RDS resources"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID"
  type        = string
}

variable "private_subnet_ids" {
  description = "Private subnet IDs for the RDS subnet group"
  type        = list(string)
}

variable "node_security_group_id" {
  description = "Security group ID of EKS worker nodes (allowed to reach RDS)"
  type        = string
}

variable "db_name" {
  type    = string
  default = "inkframe"
}

variable "db_username" {
  type      = string
  sensitive = true
}

variable "db_instance_class" {
  type    = string
  default = "db.t3.medium"
}

variable "db_allocated_storage" {
  type    = number
  default = 20
}

variable "db_max_allocated_storage" {
  type    = number
  default = 100
}

variable "db_backup_retention_days" {
  type    = number
  default = 7
}

variable "db_multi_az" {
  type    = bool
  default = true
}

variable "db_deletion_protection" {
  type    = bool
  default = true
}

variable "tags" {
  type    = map(string)
  default = {}
}

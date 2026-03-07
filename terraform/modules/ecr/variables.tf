variable "name" {
  description = "Namespace prefix for ECR repository names"
  type        = string
}

variable "repository_names" {
  description = "List of repository names to create (will be prefixed with var.name)"
  type        = list(string)
  default     = ["client", "server"]
}

variable "max_image_count" {
  description = "Maximum number of tagged images to retain per repository"
  type        = number
  default     = 20
}

variable "node_role_arn" {
  description = "IAM role ARN of the EKS worker nodes (granted pull access)"
  type        = string
}

variable "tags" {
  type    = map(string)
  default = {}
}

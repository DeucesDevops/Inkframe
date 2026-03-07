# ─────────────────────────────────────────────────────────────────────────────
# Inkframe – AWS EKS Infrastructure
#
# Resources created:
#   • VPC with public/private subnets across 3 AZs + NAT gateways
#   • EKS cluster (K8s 1.30) with ON_DEMAND + SPOT managed node groups
#   • RDS PostgreSQL 15 (Multi-AZ, encrypted, Performance Insights)
#   • ElastiCache Redis 7 (replication group, TLS, AUTH token)
#   • ECR repositories for client and server images
#   • Helm releases: AWS Load Balancer Controller, Cluster Autoscaler,
#     metrics-server, and external-secrets
# ─────────────────────────────────────────────────────────────────────────────

# ─── VPC ─────────────────────────────────────────────────────────────────────

module "vpc" {
  source = "./modules/vpc"

  name                 = local.name
  vpc_cidr             = var.vpc_cidr
  azs                  = local.azs
  private_subnet_cidrs = var.private_subnet_cidrs
  public_subnet_cidrs  = var.public_subnet_cidrs
  cluster_name         = local.cluster_name

  tags = local.common_tags
}

# ─── EKS ─────────────────────────────────────────────────────────────────────

module "eks" {
  source = "./modules/eks"

  cluster_name       = local.cluster_name
  kubernetes_version = var.kubernetes_version
  vpc_id             = module.vpc.vpc_id
  private_subnet_ids = module.vpc.private_subnet_ids
  public_subnet_ids  = module.vpc.public_subnet_ids
  environment        = var.environment

  node_groups                          = var.node_groups
  cluster_endpoint_public_access_cidrs = var.cluster_endpoint_public_access_cidrs

  tags = local.common_tags
}

# ─── RDS PostgreSQL ───────────────────────────────────────────────────────────

module "rds" {
  source = "./modules/rds"

  name                    = local.name
  vpc_id                  = module.vpc.vpc_id
  private_subnet_ids      = module.vpc.private_subnet_ids
  node_security_group_id  = module.eks.node_security_group_id

  db_name                  = var.db_name
  db_username              = var.db_username
  db_instance_class        = var.db_instance_class
  db_allocated_storage     = var.db_allocated_storage
  db_max_allocated_storage = var.db_max_allocated_storage
  db_backup_retention_days = var.db_backup_retention_days
  db_multi_az              = var.db_multi_az
  db_deletion_protection   = var.db_deletion_protection

  tags = local.common_tags
}

# ─── ElastiCache Redis ────────────────────────────────────────────────────────

module "elasticache" {
  source = "./modules/elasticache"

  name                   = local.name
  vpc_id                 = module.vpc.vpc_id
  private_subnet_ids     = module.vpc.private_subnet_ids
  node_security_group_id = module.eks.node_security_group_id

  redis_node_type       = var.redis_node_type
  redis_num_cache_nodes = var.redis_num_cache_nodes
  redis_version         = var.redis_version

  tags = local.common_tags
}

# ─── ECR Repositories ────────────────────────────────────────────────────────

module "ecr" {
  source = "./modules/ecr"

  name             = var.project_name
  repository_names = ["client", "server"]
  node_role_arn    = module.eks.cluster_autoscaler_role_arn # node role passed via ecr module var

  tags = local.common_tags
}

# ─── Helm: AWS Load Balancer Controller ──────────────────────────────────────

resource "helm_release" "aws_load_balancer_controller" {
  name       = "aws-load-balancer-controller"
  repository = "https://aws.github.io/eks-charts"
  chart      = "aws-load-balancer-controller"
  namespace  = "kube-system"
  version    = "1.7.2"

  set {
    name  = "clusterName"
    value = module.eks.cluster_name
  }

  set {
    name  = "serviceAccount.create"
    value = "true"
  }

  set {
    name  = "serviceAccount.name"
    value = "aws-load-balancer-controller"
  }

  set {
    name  = "serviceAccount.annotations.eks\\.amazonaws\\.com/role-arn"
    value = module.eks.alb_controller_role_arn
  }

  set {
    name  = "region"
    value = var.aws_region
  }

  set {
    name  = "vpcId"
    value = module.vpc.vpc_id
  }

  depends_on = [module.eks]
}

# ─── Helm: Cluster Autoscaler ─────────────────────────────────────────────────

resource "helm_release" "cluster_autoscaler" {
  name       = "cluster-autoscaler"
  repository = "https://kubernetes.github.io/autoscaler"
  chart      = "cluster-autoscaler"
  namespace  = "kube-system"
  version    = "9.36.0"

  set {
    name  = "autoDiscovery.clusterName"
    value = module.eks.cluster_name
  }

  set {
    name  = "awsRegion"
    value = var.aws_region
  }

  set {
    name  = "rbac.serviceAccount.annotations.eks\\.amazonaws\\.com/role-arn"
    value = module.eks.cluster_autoscaler_role_arn
  }

  set {
    name  = "extraArgs.balance-similar-node-groups"
    value = "true"
  }

  set {
    name  = "extraArgs.skip-nodes-with-system-pods"
    value = "false"
  }

  depends_on = [module.eks]
}

# ─── Helm: Metrics Server ────────────────────────────────────────────────────

resource "helm_release" "metrics_server" {
  name       = "metrics-server"
  repository = "https://kubernetes-sigs.github.io/metrics-server/"
  chart      = "metrics-server"
  namespace  = "kube-system"
  version    = "3.12.1"

  depends_on = [module.eks]
}

# ─── Helm: External Secrets Operator ─────────────────────────────────────────

resource "helm_release" "external_secrets" {
  name       = "external-secrets"
  repository = "https://charts.external-secrets.io"
  chart      = "external-secrets"
  namespace  = "external-secrets"
  version    = "0.9.14"

  create_namespace = true

  depends_on = [module.eks]
}

# ─── Kubernetes Namespace ─────────────────────────────────────────────────────

resource "kubernetes_namespace" "inkframe" {
  metadata {
    name = var.project_name

    labels = {
      app         = var.project_name
      environment = var.environment
    }
  }

  depends_on = [module.eks]
}

# ─── ExternalSecret: ClusterSecretStore for AWS Secrets Manager ───────────────

resource "kubernetes_manifest" "cluster_secret_store" {
  manifest = {
    apiVersion = "external-secrets.io/v1beta1"
    kind       = "ClusterSecretStore"
    metadata = {
      name = "aws-secrets-manager"
    }
    spec = {
      provider = {
        aws = {
          service = "SecretsManager"
          region  = var.aws_region
          auth = {
            jwt = {
              serviceAccountRef = {
                name      = "external-secrets"
                namespace = "external-secrets"
              }
            }
          }
        }
      }
    }
  }

  depends_on = [helm_release.external_secrets]
}

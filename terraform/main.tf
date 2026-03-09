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
  node_role_arn    = module.eks.node_role_arn

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

# ─── IRSA: External Secrets Operator ─────────────────────────────────────────

data "aws_iam_policy_document" "external_secrets_assume" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    effect  = "Allow"

    condition {
      test     = "StringEquals"
      variable = "${module.eks.oidc_provider_url}:sub"
      values   = ["system:serviceaccount:external-secrets:external-secrets"]
    }

    condition {
      test     = "StringEquals"
      variable = "${module.eks.oidc_provider_url}:aud"
      values   = ["sts.amazonaws.com"]
    }

    principals {
      identifiers = [module.eks.oidc_provider_arn]
      type        = "Federated"
    }
  }
}

resource "aws_iam_role" "external_secrets" {
  name               = "${local.cluster_name}-external-secrets"
  assume_role_policy = data.aws_iam_policy_document.external_secrets_assume.json

  tags = local.common_tags
}

resource "aws_iam_policy" "external_secrets" {
  name        = "${local.cluster_name}-external-secrets"
  description = "Allow external-secrets operator to read from Secrets Manager"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret",
          "secretsmanager:ListSecretVersionIds"
        ]
        Resource = "arn:aws:secretsmanager:${var.aws_region}:*:secret:${var.project_name}-*"
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "external_secrets" {
  policy_arn = aws_iam_policy.external_secrets.arn
  role       = aws_iam_role.external_secrets.name
}

# ─── Helm: External Secrets Operator ─────────────────────────────────────────

resource "helm_release" "external_secrets" {
  name       = "external-secrets"
  repository = "https://charts.external-secrets.io"
  chart      = "external-secrets"
  namespace  = "external-secrets"
  version    = "0.9.14"

  create_namespace = true

  set {
    name  = "serviceAccount.annotations.eks\\.amazonaws\\.com/role-arn"
    value = aws_iam_role.external_secrets.arn
  }

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

# ─── Helm: Argo CD ───────────────────────────────────────────────────────────

resource "helm_release" "argocd" {
  name       = "argocd"
  repository = "https://argoproj.github.io/argo-helm"
  chart      = "argo-cd"
  namespace  = "argocd"
  version    = "7.3.11"

  create_namespace = true

  # Expose the server behind the ALB ingress controller using an Ingress.
  # The UI is available at https://argocd.<your-domain> after DNS is wired up.
  values = [
    yamlencode({
      server = {
        service = {
          type = "ClusterIP"
        }
        ingress = {
          enabled     = true
          ingressClassName = "alb"
          annotations = {
            "alb.ingress.kubernetes.io/scheme"       = "internet-facing"
            "alb.ingress.kubernetes.io/target-type"  = "ip"
            "alb.ingress.kubernetes.io/listen-ports" = "[{\"HTTPS\": 443}]"
            "alb.ingress.kubernetes.io/certificate-arn" = var.argocd_certificate_arn
          }
          hosts = [var.argocd_hostname]
          tls   = []
        }
        # Disable TLS termination at ArgoCD; ALB handles it
        extraArgs = ["--insecure"]
      }
      # Disable the built-in Dex (SSO provider) — enable if you want SSO later
      dex = {
        enabled = false
      }
      # Resource limits for controller components
      controller = {
        resources = {
          requests = { cpu = "250m", memory = "512Mi" }
          limits   = { cpu = "1000m", memory = "1Gi" }
        }
      }
      repoServer = {
        resources = {
          requests = { cpu = "100m", memory = "256Mi" }
          limits   = { cpu = "500m", memory = "512Mi" }
        }
      }
    })
  ]

  depends_on = [module.eks, helm_release.aws_load_balancer_controller]
}

# ─── ArgoCD Application: inkframe ────────────────────────────────────────────
# Instructs ArgoCD to watch k8s/ in this repo and sync to the cluster.
# For private repos, add credentials first:
#   kubectl create secret generic inkframe-repo \
#     --from-literal=type=git \
#     --from-literal=url=https://github.com/<ORG>/<REPO>.git \
#     --from-literal=password=<GITHUB_PAT> \
#     --from-literal=username=x-token \
#     -n argocd \
#     --label=argocd.argoproj.io/secret-type=repository

resource "kubernetes_manifest" "argocd_application" {
  manifest = {
    apiVersion = "argoproj.io/v1alpha1"
    kind       = "Application"
    metadata = {
      name      = var.project_name
      namespace = "argocd"
      finalizers = ["resources-finalizer.argocd.argoproj.io"]
    }
    spec = {
      project = "default"
      source = {
        repoURL        = "https://github.com/${var.github_org}/${var.github_repo}.git"
        targetRevision = "main"
        path           = "k8s"
      }
      destination = {
        server    = "https://kubernetes.default.svc"
        namespace = var.project_name
      }
      syncPolicy = {
        automated = {
          prune    = true
          selfHeal = true
        }
        syncOptions = [
          "CreateNamespace=true",
          "ServerSideApply=true",
        ]
        retry = {
          limit = 5
          backoff = {
            duration    = "5s"
            factor      = 2
            maxDuration = "3m"
          }
        }
      }
    }
  }

  depends_on = [helm_release.argocd]
}

# ─── GitHub Actions OIDC Provider ────────────────────────────────────────────
# Allows GitHub Actions workflows to assume AWS roles without long-lived keys.

resource "aws_iam_openid_connect_provider" "github_actions" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  # Thumbprints for token.actions.githubusercontent.com (rotate if GitHub rotates certs)
  thumbprint_list = [
    "6938fd4d98bab03faadb97b34396831e3780aea1",
    "1c58a3a8518e8759bf075b76b750d4f2df264fcd",
  ]

  tags = local.common_tags
}

# ─── GitHub Actions: Deploy Role ─────────────────────────────────────────────
# Used by the deploy workflow: ECR push + EKS rolling update.

data "aws_iam_policy_document" "github_deploy_assume" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    effect  = "Allow"

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      # Restrict to pushes on main from your repo; adjust org/repo as needed.
      values   = ["repo:${var.github_org}/${var.github_repo}:ref:refs/heads/main"]
    }

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github_actions.arn]
    }
  }
}

resource "aws_iam_role" "github_deploy" {
  name               = "${local.name}-github-deploy"
  assume_role_policy = data.aws_iam_policy_document.github_deploy_assume.json

  tags = local.common_tags
}

resource "aws_iam_policy" "github_deploy" {
  name        = "${local.name}-github-deploy"
  description = "Permissions for the GitHub Actions deploy workflow"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ECRAuth"
        Effect = "Allow"
        Action = ["ecr:GetAuthorizationToken"]
        Resource = "*"
      },
      {
        Sid    = "ECRPush"
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage",
          "ecr:PutImage",
          "ecr:InitiateLayerUpload",
          "ecr:UploadLayerPart",
          "ecr:CompleteLayerUpload",
          "ecr:DescribeRepositories",
          "ecr:ListImages",
          "ecr:DescribeImages",
        ]
        Resource = [
          for name in ["client", "server"] :
          "arn:aws:ecr:${var.aws_region}:*:repository/${var.project_name}/${name}"
        ]
      },
      {
        Sid    = "EKSDescribe"
        Effect = "Allow"
        Action = [
          "eks:DescribeCluster",
        ]
        Resource = "arn:aws:eks:${var.aws_region}:*:cluster/${local.cluster_name}"
      },
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "github_deploy" {
  policy_arn = aws_iam_policy.github_deploy.arn
  role       = aws_iam_role.github_deploy.name
}

# ─── GitHub Actions: Terraform Role ──────────────────────────────────────────
# Used by the terraform workflow: plan + apply. Needs broad permissions.

data "aws_iam_policy_document" "github_terraform_assume" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    effect  = "Allow"

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_org}/${var.github_repo}:*"]
    }

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github_actions.arn]
    }
  }
}

resource "aws_iam_role" "github_terraform" {
  name               = "${local.name}-github-terraform"
  assume_role_policy = data.aws_iam_policy_document.github_terraform_assume.json

  tags = local.common_tags
}

# Attach AdministratorAccess so Terraform can manage any resource.
# Scope this down further once your infrastructure is stable.
resource "aws_iam_role_policy_attachment" "github_terraform_admin" {
  policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"
  role       = aws_iam_role.github_terraform.name
}

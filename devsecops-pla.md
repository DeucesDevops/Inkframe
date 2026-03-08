# Inkframe DevSecOps Plan

## Audit Summary

| Category | Status | Key Gaps |
|----------|--------|----------|
| CI/CD | MISSING | No GitHub Actions, GitLab CI, or Jenkins pipelines |
| Testing | MISSING | No test framework (Jest/Vitest/Playwright) configured |
| Security | PARTIAL | Missing ESLint security, Snyk, SAST/SCA, NetworkPolicy, PSS/PSP |
| Observability | PARTIAL | CloudWatch logging present; missing Prometheus/Grafana/APM |
| Network/Pod Security | GOOD | Security groups well-configured; missing NetworkPolicy and PSS |
| Dockerfiles | GOOD | Multi-stage builds present; server runs as root |
| Health Checks | PARTIAL | Configured in K8s; `/health` endpoint not implemented in app code |
| IaC | EXCELLENT | Complete Terraform setup with modules |
| Backups | GOOD | RDS/Redis backups automated; missing cross-region, runbooks, testing |

---

## Phase 1 — Critical Blockers (Do First)

These prevent the app from running correctly in production.

### 1.1 Add `/health` endpoint to server
- **File:** `server/src/index.ts`
- **Why:** K8s readiness and liveness probes hit `GET /health:5000` — without it pods never become Ready and Kubernetes will restart them indefinitely.
- **Task:** Add a simple `app.get('/health', (_, res) => res.status(200).json({ status: 'ok' }))` route.

### 1.2 Fix server Dockerfile — non-root USER
- **File:** `server/Dockerfile`
- **Why:** Container runs as root, which is a CIS Benchmark and OWASP Docker Top 10 violation. Client already correctly uses `USER nextjs` (UID 1001).
- **Task:** Add `RUN addgroup -S appgroup && adduser -S appuser -G appgroup` and `USER appuser` before `CMD`.

### 1.3 Configure unit testing on server
- **Why:** CI pipeline cannot enforce quality without tests. Zero test files currently exist.
- **Task:** Install Jest + Supertest + ts-jest; add `jest.config.ts`; write baseline tests for health endpoint, auth routes, and middleware.

---

## Phase 2 — CI/CD Pipeline

No automated pipelines exist. All builds and deployments are manual.

### 2.1 GitHub Actions — CI workflow (`.github/workflows/ci.yml`)
Triggers: push and pull_request to `main` and `develop`.

Steps:
1. Checkout code
2. Install dependencies (client + server)
3. Run ESLint on client and server
4. Run Jest unit tests on server
5. Build Docker images (client + server)
6. Run Trivy vulnerability scan on built images
7. Fail pipeline on HIGH/CRITICAL CVEs

### 2.2 GitHub Actions — CD workflow (`.github/workflows/deploy.yml`)
Triggers: push to `main` (staging auto-deploy); manual `workflow_dispatch` for production.

Steps:
1. Authenticate to AWS (OIDC — no long-lived keys)
2. Push Docker images to ECR
3. Run Prisma migrations via K8s Job
4. Apply Kubernetes manifests (`kubectl apply`)
5. Wait for rollout (`kubectl rollout status`)
6. Smoke test health endpoints

### 2.3 GitHub Actions — Security scanning (`.github/workflows/security.yml`)
Triggers: schedule (daily) + PR.

Steps:
1. `npm audit` on client and server
2. Trivy filesystem scan (dependencies)
3. Secret scanning (Gitleaks or `trufflesecurity/trufflehog`)
4. OWASP Dependency-Check report

### 2.4 Required GitHub Secrets
```
AWS_ROLE_ARN          # OIDC role for CI
ECR_REGISTRY          # ECR registry URL
EKS_CLUSTER_NAME      # Target cluster
AWS_REGION            # Deployment region
```

---

## Phase 3 — Security Hardening

### 3.1 Kubernetes NetworkPolicies
- **File:** `terraform/k8s/network-policies.yaml`
- Deny all ingress/egress by default in `inkframe` namespace
- Allow client → server on port 5000
- Allow server → RDS on port 5432
- Allow server → Redis on port 6379
- Allow ingress-controller → client on port 3000

### 3.2 Pod Security Standards (PSS)
- Add label `pod-security.kubernetes.io/enforce: restricted` to `inkframe` namespace
- Update deployments to comply: `allowPrivilegeEscalation: false`, `runAsNonRoot: true`, `readOnlyRootFilesystem: true`, `seccompProfile: RuntimeDefault`

### 3.3 ResourceQuotas + PodDisruptionBudgets
- **File:** `terraform/k8s/resource-quota.yaml`
- Cap CPU and memory consumption in `inkframe` namespace
- Add `PodDisruptionBudget` (minAvailable: 1) for both client and server deployments

### 3.4 ESLint Security Plugin
- Add `eslint-plugin-security` to both client and server
- Add `plugin:security/recommended` to ESLint configs

### 3.5 WAF on ALB
- Enable AWS WAF v2 on the ALB Ingress
- Add managed rule groups: AWSManagedRulesCommonRuleSet, AWSManagedRulesSQLiRuleSet, AWSManagedRulesKnownBadInputsRuleSet

---

## Phase 4 — Observability

CloudWatch control-plane logs exist. Application-level metrics and alerting are absent.

### 4.1 Prometheus + Grafana (kube-prometheus-stack)
- Add Helm release in `terraform/main.tf` using `kube-prometheus-stack` chart
- Scrape Node.js metrics via `prom-client` in the server app
- Expose `/metrics` endpoint (internal only, not through ingress)

### 4.2 Application metrics to instrument
- HTTP request rate, latency (p50/p95/p99), error rate
- Database connection pool usage
- Redis cache hit/miss ratio
- Authentication success/failure rates

### 4.3 Alerting rules (Prometheus Alertmanager)
- PodCrashLooping
- HighErrorRate (5xx > 1% of requests)
- HighLatency (p95 > 2s)
- Database connection exhaustion
- Node memory/CPU pressure

### 4.4 Distributed Tracing
- Add OpenTelemetry SDK to server
- Export traces to AWS X-Ray or Jaeger
- Instrument Express middleware, Prisma queries, Redis calls

### 4.5 CloudWatch Dashboards
- Create dashboards for EKS node metrics, RDS performance, Redis memory
- Set CloudWatch Alarms for RDS storage < 20%, Redis memory > 80%

---

## Phase 5 — Disaster Recovery

### 5.1 Cross-region RDS snapshot replication
- Enable automated cross-region snapshot copy in Terraform RDS module
- Target region: choose secondary AWS region

### 5.2 Disaster recovery runbook
- Document RTO/RPO targets
- Step-by-step RDS restoration procedure
- Step-by-step Redis restoration procedure
- Terraform state recovery procedure (S3 versioning rollback)
- Kubernetes manifest re-apply procedure

### 5.3 Backup validation
- Monthly automated restore test (RDS snapshot → test instance)
- Document and store results

---

## Implementation Sequence

```
Week 1 (Unblock Production)
├── 1.1  /health endpoint
├── 1.2  Server Dockerfile non-root USER
└── 1.3  Jest + baseline tests

Week 2 (Automate Everything)
├── 2.1  CI workflow (lint, test, scan, build)
├── 2.2  CD workflow (ECR push, K8s deploy)
└── 2.3  Security scanning workflow

Week 3 (Harden)
├── 3.1  Kubernetes NetworkPolicies
├── 3.2  Pod Security Standards
├── 3.3  ResourceQuotas + PodDisruptionBudgets
└── 3.4  ESLint security plugin

Week 4 (Observe)
├── 4.1  kube-prometheus-stack deployment
├── 4.2  prom-client metrics in server
├── 4.3  Alertmanager rules
└── 4.5  CloudWatch dashboards + alarms

Week 5 (Resilience)
├── 5.1  Cross-region RDS snapshots
├── 5.2  DR runbook
└── 5.3  Backup validation procedure
```

---

---

## How to Deploy (Current Manual Process)

> This section documents the current manual deployment procedure.
> Once Phase 2 CI/CD is implemented, Steps 9–15 will be automated by the pipeline.

### What You Will Need

| Tool | What it does | Install guide |
|---|---|---|
| **AWS CLI v2** | Talks to your AWS account from the terminal | https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html |
| **Terraform ≥ 1.6** | Provisions the AWS infrastructure | https://developer.hashicorp.com/terraform/install |
| **kubectl** | Manages Kubernetes resources | https://kubernetes.io/docs/tasks/tools/ |
| **Helm** | Installs pre-packaged Kubernetes apps | https://helm.sh/docs/intro/install/ |
| **Git** | Source control | https://git-scm.com/downloads |

Verify all tools:
```bash
aws --version && terraform --version && kubectl version --client && helm version
```

---

### Step 1 — AWS Account Setup

1. Create IAM user `terraform-deployer` with `AdministratorAccess`
2. Generate access key → run `aws configure` (region: `us-east-1`, output: `json`)
3. Verify: `aws sts get-caller-identity`

---

### Step 2 — Create Terraform State Backend

```bash
# Create S3 bucket (replace your-name with something unique)
aws s3api create-bucket --bucket inkframe-terraform-state-your-name --region us-east-1
aws s3api put-bucket-versioning --bucket inkframe-terraform-state-your-name \
  --versioning-configuration Status=Enabled
aws s3api put-bucket-encryption --bucket inkframe-terraform-state-your-name \
  --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
aws s3api put-public-access-block --bucket inkframe-terraform-state-your-name \
  --public-access-block-configuration "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

# Create DynamoDB lock table
aws dynamodb create-table \
  --table-name terraform-locks \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region us-east-1
```

---

### Step 3 — Configure Terraform Backend

Edit `terraform/versions.tf` `backend "s3"` block:
```hcl
bucket         = "inkframe-terraform-state-your-name"
key            = "inkframe/eks/terraform.tfstate"
region         = "us-east-1"
dynamodb_table = "terraform-locks"
encrypt        = true
```

---

### Step 4 — Create Variables File

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars
```

Minimum changes in `terraform.tfvars`:
```hcl
domain_name            = "yourdomain.com"   # or "" if no domain yet
db_deletion_protection = false               # set true for real production
```

> `terraform.tfvars` is gitignored — never commit it.

---

### Step 5–7 — Provision Infrastructure

```bash
cd terraform
terraform init    # downloads providers, connects to S3 backend
terraform plan    # preview (~87 resources to add)
terraform apply   # creates real AWS resources (~25–35 minutes)
```

Save the outputs — you will need the ECR URLs and cluster name.

---

### Step 8 — Configure kubectl

```bash
aws eks update-kubeconfig --region us-east-1 --name inkframe-production-eks
kubectl get nodes   # should show 2–4 nodes as Ready
```

---

### Step 9 — Build and Push Docker Images

```bash
# Authenticate Docker to ECR (replace 123456789 with your AWS account ID)
aws ecr get-login-password --region us-east-1 \
  | docker login --username AWS --password-stdin 123456789.dkr.ecr.us-east-1.amazonaws.com

# Build and push server
cd server
docker build -t inkframe/server .
docker tag inkframe/server 123456789.dkr.ecr.us-east-1.amazonaws.com/inkframe/server:latest
docker push 123456789.dkr.ecr.us-east-1.amazonaws.com/inkframe/server:latest

# Build and push client
cd ../client
docker build -t inkframe/client .
docker tag inkframe/client 123456789.dkr.ecr.us-east-1.amazonaws.com/inkframe/client:latest
docker push 123456789.dkr.ecr.us-east-1.amazonaws.com/inkframe/client:latest
```

---

### Step 10 — Update Kubernetes Manifests

Replace `<AWS_ACCOUNT_ID>` and `<REGION>` placeholders in:
- `terraform/k8s/server-deployment.yaml`
- `terraform/k8s/client-deployment.yaml`
- `terraform/k8s/db-migration-job.yaml`
- `terraform/k8s/ingress.yaml` (replace `<CERT_ID>` with ACM certificate ARN)

---

### Step 11 — (Optional) Request TLS Certificate

```bash
aws acm request-certificate \
  --domain-name yourdomain.com \
  --subject-alternative-names "*.yourdomain.com" \
  --validation-method DNS \
  --region us-east-1
```

Add the DNS validation record at your registrar. Certificate is ready in ~5 minutes.

---

### Step 12 — Create Static Kubernetes Secrets

```bash
kubectl create secret generic inkframe-static-secrets \
  --namespace inkframe \
  --from-literal=JWT_SECRET="$(openssl rand -base64 48)" \
  --from-literal=GEMINI_API_KEY="your-gemini-api-key" \
  --from-literal=STRIPE_SECRET_KEY="your-stripe-secret-key"
```

---

### Step 13 — Apply Kubernetes Manifests

```bash
kubectl apply -f terraform/k8s/
```

---

### Step 14 — Run Database Migrations

```bash
kubectl apply -f terraform/k8s/db-migration-job.yaml
kubectl logs -n inkframe -l app=prisma-migrate -f
# Wait for: "Migrations complete."
```

---

### Step 15 — Verify

```bash
kubectl get pods -n inkframe        # all should be Running 1/1
kubectl get ingress -n inkframe     # wait for ADDRESS to appear (~2–3 min)
kubectl logs -n inkframe -l app=server -f
```

Healthy pod list:
```
NAME                      READY   STATUS    RESTARTS
client-7d9f8b6c4-abc12    1/1     Running   0
server-6c8d7f5b3-ghi56    1/1     Running   0
```

---

### Step 16 — Point DNS at the Load Balancer

Get the ALB hostname:
```bash
kubectl get ingress -n inkframe
```

Add at your registrar:
| Type | Name | Value |
|---|---|---|
| CNAME | `@` | the ELB address |
| CNAME | `api` | the ELB address |

---

### Useful Day-to-Day Commands

```bash
kubectl get all -n inkframe
kubectl rollout restart deployment/server -n inkframe
kubectl set image deployment/server server=<ECR_URL>:v1.2.3 -n inkframe
kubectl scale deployment/server --replicas=4 -n inkframe
kubectl exec -it -n inkframe $(kubectl get pod -n inkframe -l app=server -o jsonpath='{.items[0].metadata.name}') -- sh
kubectl top pods -n inkframe && kubectl top nodes

# Re-run migrations
kubectl delete job prisma-migrate -n inkframe --ignore-not-found
kubectl apply -f terraform/k8s/db-migration-job.yaml
```

---

### Tearing Everything Down

```bash
# Remove K8s resources first (they provision ALBs outside Terraform)
kubectl delete -f terraform/k8s/

# Destroy all AWS infrastructure
cd terraform
terraform destroy
```

If destroy fails on RDS due to deletion protection:
```bash
# In terraform.tfvars: db_deletion_protection = false
terraform apply && terraform destroy
```

---

### Troubleshooting

**Pods stuck in `Pending`**
```bash
kubectl describe pod <pod-name> -n inkframe
# Check Events section — usually: insufficient resources or image pull error
```

**Pods in `CrashLoopBackOff`**
```bash
kubectl logs -n inkframe <pod-name> --previous
# Common: missing env var, bad secret ARN, app startup error
```

**ExternalSecret not syncing**
```bash
kubectl describe externalsecret inkframe-app-secrets -n inkframe
# Check IRSA annotation on the external-secrets service account
```

**`terraform apply` fails mid-way**
Just re-run `terraform apply` — Terraform is idempotent and picks up where it left off.

---

### Cost Estimate (us-east-1, 2026)

| Resource | Approx. monthly cost |
|---|---|
| EKS control plane | ~$73 |
| 2× t3.medium nodes (ON_DEMAND) | ~$60 |
| 2× t3.large SPOT nodes | ~$25 |
| RDS db.t3.medium Multi-AZ | ~$100 |
| ElastiCache cache.t3.small (2 nodes) | ~$50 |
| NAT Gateways (3×) | ~$100 |
| ALB | ~$20 |
| ECR, Secrets Manager, CloudWatch | ~$10–20 |
| **Total estimate** | **~$440/month** |

To reduce costs during development: set `db_multi_az = false`, `redis_num_cache_nodes = 1`, reduce to 1 AZ (1 NAT Gateway).

---

## What Already Exists (Do Not Rebuild)

- VPC with public/private subnets across 3 AZs
- EKS cluster with KMS-encrypted secrets and IRSA
- RDS PostgreSQL 15: Multi-AZ, encrypted, 7-day backups, deletion protection
- ElastiCache Redis 7: TLS, AUTH token, 3-snapshot retention, Multi-AZ
- ECR repositories with scan-on-push and lifecycle policies
- Terraform state in S3 (versioned, encrypted) + DynamoDB lock table
- ALB Ingress with TLS redirect
- ExternalSecrets pulling from AWS Secrets Manager
- HPA on both client and server deployments
- EKS control-plane logs to CloudWatch (api, audit, authenticator, controllerManager, scheduler)
- VPC Flow Logs (30-day retention)
- RDS Performance Insights + Enhanced Monitoring

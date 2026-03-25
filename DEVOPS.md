# How This Project Works — A DevOps Walkthrough

> This document explains the full journey of code in this project — from the moment
> you type it on your laptop to the moment a real user sees it running in the cloud.
> Written for someone new to DevOps.

---

## What Is Inkframe?

Inkframe is a full-stack web application built with:
- **Client** — Next.js 14 (React, TypeScript, App Router)
- **Server** — Node.js + Express (TypeScript, Prisma ORM, BullMQ job queues)
- **Database** — PostgreSQL (managed by AWS RDS)
- **Cache / Queue** — Redis (managed by AWS ElastiCache)

The DevOps setup for this project is designed to be **AWS-native** — meaning it uses
AWS tools throughout rather than generic tools. This is a deliberate choice to demonstrate
a different set of skills compared to the other projects in this portfolio.

---

## How This Project Differs From the Others

Every project in this portfolio uses the same core DevOps tools (Docker, Kubernetes,
GitHub Actions, ArgoCD, Terraform, Prometheus/Grafana). But each project uses them
in a slightly different way to show breadth:

| Concern | This project (Inkframe) | E-commerce project |
|---|---|---|
| **AWS auth from CI** | OIDC (no passwords stored) | GitHub Secrets |
| **Container registry** | AWS ECR | GitHub GHCR |
| **Image tag management** | Kustomize | sed command |
| **DB schema changes** | Prisma migration Job | Manual |
| **Load balancer** | AWS ALB (native) | Nginx Ingress |
| **Secrets in K8s** | External Secrets Operator | K8s Secrets |
| **Terraform CI** | Full pipeline with PR plan | Apply only |
| **Runtime metrics** | Node.js prom-client | Spring Boot Actuator |

Each difference is intentional — it shows you know multiple approaches, not just one.

---

## The Big Picture

```
You push code to GitHub
        │
        ▼
3 GitHub Actions pipelines run automatically:
  ├── CI pipeline       — lint, typecheck, docker build check
  ├── Deploy pipeline   — build images, scan, migrate DB, deploy
  └── Terraform pipeline — validate/plan/apply infrastructure changes
        │
        ▼
ArgoCD watches the k8s/ folder in Git
Detects the updated image tag → deploys to Kubernetes
        │
        ▼
Kubernetes runs the app on AWS EKS
Prometheus collects metrics → Grafana shows dashboards
Alertmanager sends Slack alerts if something breaks
```

---

## The 6 Layers

```
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 6 — MONITORING     Prometheus + Grafana + Alertmanager   │
│  "Is everything healthy in production?"                         │
├─────────────────────────────────────────────────────────────────┤
│  LAYER 5 — KUBERNETES     EKS (AWS)                             │
│  "The platform that runs your app in the cloud"                 │
├─────────────────────────────────────────────────────────────────┤
│  LAYER 4 — GITOPS (CD)    ArgoCD + Kustomize                    │
│  "Automatically deploys your app when the code changes"         │
├─────────────────────────────────────────────────────────────────┤
│  LAYER 3 — CI/CD PIPELINE GitHub Actions (3 workflows)          │
│  "Tests, scans, and packages your code automatically"           │
├─────────────────────────────────────────────────────────────────┤
│  LAYER 2 — CONTAINERS     Docker + AWS ECR                      │
│  "Packages your app so it runs the same everywhere"             │
├─────────────────────────────────────────────────────────────────┤
│  LAYER 1 — INFRASTRUCTURE Terraform on AWS                      │
│  "Creates the cloud servers and databases your app lives on"    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Layer 1 — Infrastructure (Terraform)

**In plain English:** Before your app can run anywhere, you need real servers in the cloud.
Terraform creates those servers by reading config files. You describe what you want,
and AWS builds it.

**What Terraform creates for this project:**

```
AWS Cloud
│
├── VPC (Virtual Private Cloud)
│     Your own private network inside AWS. Your services talk to each other
│     here, hidden from the public internet.
│
├── EKS Cluster (Elastic Kubernetes Service)
│     A group of managed servers that run your containers.
│
├── RDS (Relational Database Service)
│     A managed PostgreSQL database. AWS handles backups, patches, and
│     high availability — you just connect to it.
│
├── ElastiCache (Redis)
│     A managed Redis instance. Used by BullMQ for background job queues
│     and for caching session data.
│
└── ECR (Elastic Container Registry)
      AWS's own Docker image storage — like Docker Hub but inside AWS.
      Your CI pipeline pushes images here, and EKS pulls from here.
```

**What the Terraform CI pipeline does (`terraform.yml`):**

```
You open a Pull Request that changes something in terraform/
        │
        ▼
STEP 1: Validate
  - terraform fmt -check  → checks code is properly formatted
  - terraform validate    → checks for syntax errors

STEP 2: Plan
  - terraform plan        → calculates what WILL change (preview only)
  - Posts the plan as a comment on your Pull Request
  - You review it before merging

STEP 3: Apply (only after PR is merged to main)
  - Requires manual approval in GitHub (a human must click "Approve")
  - terraform apply       → actually creates/changes infrastructure in AWS
```

> **Why manual approval on apply?** Infrastructure changes are hard to undo.
> A mis-typed variable could delete a database. The approval gate means a
> second person must review the plan before it runs.

**Remote state:** Terraform's record of what it created is stored in an S3 bucket
(not on anyone's laptop). This means the whole team can run Terraform without
conflicts, and you never lose track of what exists in AWS.

---

## Layer 2 — Containers (Docker + AWS ECR)

**In plain English:** Docker packages your app into a portable box (an image) that
runs identically on your laptop, in CI, and in production.

**This project has 2 Docker images:**

| Image | What it contains |
|---|---|
| `inkframe/client` | Next.js app compiled to a standalone Node.js server |
| `inkframe/server` | Express API with Prisma, BullMQ, and all business logic |

**Where images are stored:** AWS ECR (Elastic Container Registry).
The CI pipeline pushes to ECR with a tag based on the Git commit SHA:
`123456789012.dkr.ecr.us-east-1.amazonaws.com/inkframe/server:sha-a3f9c12`

**Why ECR instead of Docker Hub or GitHub?**
- ECR lives inside the same AWS account as the EKS cluster
- No rate limits, no extra authentication needed between ECR and EKS
- Images never leave your AWS account

---

## Layer 3 — CI/CD Pipelines (GitHub Actions)

This project has **3 separate pipelines**, each triggered by different events:

### Pipeline 1 — CI (`ci.yml`)
Runs on every push AND every pull request to main.

```
Push or PR → GitHub
        │
        ▼
  Client: ESLint + TypeScript typecheck
  Server: TypeScript typecheck
  Both:   Docker build (no push) — confirms the Dockerfile compiles
```

**Purpose:** Fast feedback. Catches lint errors, type errors, and broken Dockerfiles
before they reach main. Takes ~3 minutes.

---

### Pipeline 2 — Deploy (`deploy.yml`)
Runs only on pushes to main (after a PR is merged).

```
Push to main
        │
        ▼
STAGE 1: Build & Push (parallel)
  Build client Docker image → push to ECR with sha-<commit> tag
  Build server Docker image → push to ECR with sha-<commit> tag

        │
        ▼
STAGE 2: Trivy Security Scan (parallel, both images)
  Scan client image for known CVEs (vulnerabilities)
  Scan server image for known CVEs
  Upload results to GitHub Security tab
  ⚠️  If CRITICAL or HIGH severity found → pipeline stops. Nothing deploys.

        │
        ▼
STAGE 3: Prisma Database Migration
  Runs "prisma migrate deploy" as a one-off Kubernetes Job
  This updates the database schema BEFORE the new code is deployed
  Waits for the Job to complete (up to 2 minutes)
  Prints the migration logs so you can see what ran

        │
        ▼
STAGE 4: GitOps Update
  Updates k8s/kustomization.yaml with the new image tags
  Commits: "chore(deploy): bump images to sha-a3f9c12"
  ArgoCD detects the commit → deploys automatically (Layer 4)
  Waits for kubectl rollout status → confirms pods are healthy
```

**Key security feature — OIDC authentication:**

Most CI pipelines store AWS credentials (access key + secret) as GitHub Secrets.
This project uses **OIDC** instead. Here's the difference:

```
Old way (secrets):
  GitHub has a long-lived AWS key stored as a secret.
  If GitHub is ever breached, the attacker has your AWS key permanently.

New way (OIDC):
  GitHub proves its identity to AWS with a short-lived token.
  AWS issues a temporary credential that expires in 1 hour.
  No permanent credential ever exists anywhere.
  Even if intercepted, it expires before it can be abused.
```

This is the enterprise-grade approach used by large companies.

---

### Pipeline 3 — Terraform (`terraform.yml`)
Runs only when files in `terraform/` change.

Already described in Layer 1 above.

---

## Layer 4 — GitOps Deployment (ArgoCD + Kustomize)

**In plain English:** ArgoCD watches your Git repository. The moment it detects a
change in the `k8s/` folder, it automatically applies that change to the Kubernetes cluster.

### What is Kustomize?

Kustomize is a tool that manages Kubernetes YAML files. The key file is
`k8s/kustomization.yaml`:

```yaml
resources:
  - namespace.yaml
  - server-deployment.yaml
  - client-deployment.yaml
  - monitoring.yaml
  ...

images:
  - name: inkframe/server
    newName: 123456789.dkr.ecr.us-east-1.amazonaws.com/inkframe/server
    newTag: sha-a3f9c12    ← this line is updated by the deploy pipeline
```

When the deploy pipeline runs `kustomize edit set image`, it updates the `newTag`
line and commits. ArgoCD detects the commit and tells Kubernetes to pull the new image.

### The GitOps principle

> **Git is the single source of truth.**
>
> The cluster always matches exactly what is in Git.
> If someone manually changes something in the cluster, ArgoCD reverts it.
> The only way to change production is to change the code in Git.

### The Prisma Migration Job

Before the new app version rolls out, a one-off Kubernetes Job runs:

```
Job starts → runs "prisma migrate deploy" against the production database
           → applies any pending SQL migrations
           → exits when done
```

Why do this before rolling out the new pods? Because the new code might expect
database columns or tables that don't exist yet. Running migrations first means
the new code always finds a compatible database.

After the Job completes successfully, ArgoCD rolls out the new pods.

---

## Layer 5 — Kubernetes (EKS)

**In plain English:** Kubernetes is the platform that runs your containers in the cloud.
It decides which server runs which container, restarts crashed containers, and
scales up when traffic is high.

### What lives in Kubernetes for this project

```
k8s/
├── namespace.yaml          ← creates the "inkframe" isolated space
├── ingress.yaml            ← public entry points + ConfigMap with URLs
│                             (two ingresses: one for client, one for server)
├── external-secrets.yaml   ← pulls secrets from AWS Secrets Manager
├── server-deployment.yaml  ← deployment + service + HPA for the API
├── client-deployment.yaml  ← deployment + service + HPA for Next.js
├── db-migration-job.yaml   ← one-off Prisma migration Job
└── monitoring.yaml         ← Prometheus, Alertmanager, Grafana
```

### Key Kubernetes features used here

**AWS ALB Ingress (Application Load Balancer)**

Instead of Nginx, this project uses AWS's native load balancer.
The ALB handles TLS termination, redirects HTTP → HTTPS, and routes:
- `inkframe.io` → client service (Next.js, port 3000)
- `api.inkframe.io` → server service (Express, port 5000)

This is the AWS-native way to expose apps — no third-party load balancer needed.

**External Secrets Operator**

Most projects store secrets like `DATABASE_URL` and `JWT_SECRET` as Kubernetes Secrets
defined in YAML files. The problem: you have to put the actual value somewhere.

This project uses the **External Secrets Operator**:
1. Secrets are stored in **AWS Secrets Manager** (encrypted, audited, access-controlled)
2. External Secrets Operator reads from AWS Secrets Manager every hour
3. It creates or updates Kubernetes Secrets automatically
4. Your app reads from Kubernetes Secrets as normal

Your actual passwords never appear in any file that gets committed to Git.

**Topology Spread Constraints**

```yaml
topologySpreadConstraints:
  - maxSkew: 1
    topologyKey: topology.kubernetes.io/zone
```

This tells Kubernetes: "spread my pods across AWS Availability Zones evenly."
If one AZ has an outage, pods in the other AZs keep serving traffic.
Maximum skew of 1 means no AZ can have more than 1 extra pod compared to the others.

**Rolling Update Strategy**

```yaml
strategy:
  type: RollingUpdate
  rollingUpdate:
    maxSurge: 1        ← start 1 new pod before stopping any old pods
    maxUnavailable: 0  ← never have fewer pods than the desired count
```

This means: during a deploy, always start a new pod and wait for it to be healthy
before shutting down an old one. Zero downtime guaranteed.

**Health Probes**

```yaml
readinessProbe:
  httpGet:
    path: /health
    port: 5000
  initialDelaySeconds: 15
  periodSeconds: 10

livenessProbe:
  httpGet:
    path: /health
    port: 5000
  initialDelaySeconds: 30
  periodSeconds: 20
```

- **Readiness probe:** Kubernetes checks `/health` every 10 seconds after startup.
  Until it returns 200, no traffic is sent to the pod. This prevents routing requests
  to a pod that isn't ready yet.
- **Liveness probe:** Checks `/health` every 20 seconds. If it fails 3 times in a row,
  Kubernetes kills the pod and starts a fresh one. This handles silent crashes.

The `/health` endpoint in the server returns:
```json
{ "status": "ok", "timestamp": "2026-03-25T10:00:00.000Z" }
```

**HPA (Horizontal Pod Autoscaler)**

```yaml
minReplicas: 2
maxReplicas: 10
metrics:
  - CPU target: 70%
  - Memory target: 80%
```

At minimum, 2 pods of the server are always running (resilience + zero downtime deploys).
If CPU or memory goes above the target, Kubernetes adds more pods automatically.
When traffic drops, it scales back down to 2.

---

## Layer 6 — Monitoring (Prometheus + Grafana + Alertmanager)

**In plain English:** Once the app is running, you need to know if it's healthy.
Is it slow? Are requests failing? Is the Node.js process running out of memory?
The monitoring stack answers these questions in real time.

### How metrics flow from the app to Grafana

```
Express server has prom-client installed
Every request is measured (duration, route, status code)
Node.js runtime stats are collected (heap, event loop, GC)
All stats exposed at GET /metrics in Prometheus format
            │
            │  every 15 seconds
            ▼
        PROMETHEUS
Stores all the numbers as time-series data
Evaluates alert rules every 15 seconds
            │                        │
   queries  │              alerts to │
            ▼                        ▼
        GRAFANA                ALERTMANAGER
Two pre-built dashboards   Routes alerts to Slack
load on first boot         channel #inkframe-alerts
```

### The 2 Grafana dashboards

**HTTP Overview dashboard:**
- Request rate per route (how many requests/second to each endpoint?)
- Error rate % (what % of requests return 5xx errors?)
- p50 / p95 / p99 latency (how fast are responses at the 50th, 95th, 99th percentile?)
- Server up/down status indicator

**Node.js Runtime dashboard:**
- Heap memory used (bytes and %)
- Event loop lag (is Node.js blocked by synchronous operations?)
- Active handles and requests (how many things is the process managing?)

### The 6 alerting rules

| Alert | Fires when | Severity |
|---|---|---|
| `ServerDown` | Server unreachable for 2+ minutes | Critical |
| `HighRestartRate` | Pod restarted more than once in 15 minutes | Warning |
| `HighHttpErrorRate` | More than 5% of requests returning 5xx | Critical |
| `HighP95Latency` | p95 response time above 2 seconds | Warning |
| `HighHeapUsage` | Node.js heap above 85% full | Warning |
| `HighEventLoopLag` | Event loop lag above 500ms for 3+ minutes | Warning |

---

## One Complete Flow — From Code to Production

```
1. You fix a bug in the Express server on your laptop
   └─ You test it locally with docker-compose up

2. You push to a feature branch and open a Pull Request
   └─ ci.yml runs: ESLint, TypeScript check, Docker build check (~3 min)
   └─ If anything fails, GitHub blocks the merge

3. You merge the PR to main

4. deploy.yml starts automatically
   ├─ Builds and pushes client + server images to ECR with sha-a3f9c12 tag
   ├─ Trivy scans both images for CVEs (~3 min)
   │    If CRITICAL/HIGH found → stops here. Nothing deploys.
   ├─ Runs Prisma migrations as a K8s Job (~1 min)
   └─ Updates kustomization.yaml → commits "chore(deploy): bump to sha-a3f9c12"

5. ArgoCD detects the new commit to k8s/kustomization.yaml
   └─ Syncs the cluster to match Git

6. Kubernetes performs a rolling update
   ├─ Starts new server pod with sha-a3f9c12 image
   ├─ Waits for /health to return 200 OK
   ├─ Only then terminates the old pod
   └─ Zero downtime

7. Prometheus scrapes /metrics from the new pod every 15 seconds
   └─ Grafana dashboards update in real time

8. If anything goes wrong (5xx spike, pod crashes, heap at 90%):
   └─ Alertmanager sends a message to #inkframe-alerts on Slack

Total time from git push to live in production: ~10–12 minutes, fully automated.
```

---

## Local Development vs Production

| | Local (your laptop) | Production (AWS) |
|---|---|---|
| **How to run** | `docker-compose up` | Kubernetes on EKS |
| **Database** | Docker container (postgres) | Managed AWS RDS |
| **Redis / Queue** | Docker container (redis) | Managed AWS ElastiCache |
| **Images** | Built locally | Stored in AWS ECR |
| **TLS (HTTPS)** | No | Yes — AWS ACM + ALB |
| **Secrets** | `.env` file | AWS Secrets Manager → K8s |
| **Scaling** | Fixed (1 copy of each service) | Automatic (HPA: 2–10 pods) |
| **Monitoring** | None | Prometheus + Grafana + Alertmanager |
| **Deployment** | `docker-compose up` | Automatic (GitHub Actions + ArgoCD) |

---

## Glossary

| Term | Plain English explanation |
|---|---|
| **OIDC** | A way for GitHub to prove its identity to AWS using short-lived tokens instead of stored passwords |
| **ECR** | Elastic Container Registry — AWS's private Docker image storage |
| **EKS** | Elastic Kubernetes Service — AWS's managed Kubernetes |
| **RDS** | Relational Database Service — AWS's managed PostgreSQL/MySQL |
| **ElastiCache** | AWS's managed Redis |
| **ALB** | Application Load Balancer — AWS's native load balancer that routes traffic to Kubernetes |
| **Kustomize** | A tool that manages Kubernetes YAML files and lets you patch values (like image tags) without duplicating files |
| **External Secrets Operator** | A K8s tool that pulls secrets from AWS Secrets Manager and creates K8s Secrets automatically |
| **Prisma** | A TypeScript ORM — handles database queries and schema migrations |
| **BullMQ** | A job queue library for Node.js backed by Redis — handles background tasks |
| **prom-client** | The official Prometheus client library for Node.js — exposes metrics at /metrics |
| **Topology spread** | A Kubernetes feature that spreads pods across multiple AWS Availability Zones for resilience |
| **OIDC** | OpenID Connect — a secure way to authenticate between services without storing long-lived credentials |
| **CVE** | Common Vulnerability and Exposure — a known security flaw in a piece of software |
| **Trivy** | A security scanner that checks Docker images for known CVEs |
| **Rolling update** | Deploying a new version one pod at a time so there is zero downtime |
| **HPA** | Horizontal Pod Autoscaler — automatically adds/removes pods based on CPU or memory |
| **Readiness probe** | Kubernetes checks if a pod is ready to receive traffic before sending any |
| **Liveness probe** | Kubernetes checks if a pod is still alive — kills and restarts it if it stops responding |
| **GitOps** | Using Git as the single source of truth for what should be running in production |
| **ArgoCD** | A GitOps tool — watches Git and keeps the Kubernetes cluster in sync with it |

# Inkframe DevSecOps — Full Implementation How-To

This guide contains exact, copy-paste-ready steps to implement every item in
the DevSecOps plan. Follow the phases in order — each phase builds on the
previous one. Every code block is specific to this repo's structure.

---

## Phase 1 — Critical Blockers

These must be done before any deployment works correctly in Kubernetes.

---

### 1.1 Add `/health` endpoint to the server

**Why:** `server-deployment.yaml` readiness and liveness probes both call
`GET /health` on port 5000. Without this route, every pod fails its probe,
Kubernetes continuously restarts it, and the app never becomes available.

**File:** `server/src/index.ts`

Add the health route **before** the API routes and **before** the error handler:

```typescript
// After the middleware block, before app.use('/api/auth', ...)
app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() })
})
```

Final `server/src/index.ts` should look like:

```typescript
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { authRouter } from './routes/auth.js'
import { projectRouter } from './routes/projects.js'
import { skillRouter } from './routes/skills.js'
import { errorHandler } from './middleware/errorHandler.js'
import './jobs/workers/ingestionWorker.js'

const app = express()

app.use(helmet())
app.use(cors({
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    credentials: true
}))
app.use(express.json({ limit: '10mb' }))

// Health check — must come before API routes
app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Routes
app.use('/api/auth', authRouter)
app.use('/api/projects', projectRouter)
app.use('/api/skills', skillRouter)

// Error Handler
app.use(errorHandler)

const PORT = process.env.PORT || 5000
if (process.env.NODE_ENV !== 'test') {
    app.listen(PORT, () => console.log(`Inkframe API running on port ${PORT}`))
}

export default app
```

> Note: the default PORT is also corrected to `5000` to match the K8s manifest.

**Verify locally:**
```bash
cd server
npm run dev &
curl http://localhost:5000/health
# Expected: {"status":"ok","timestamp":"..."}
```

---

### 1.2 Fix server Dockerfile — run as non-root

**Why:** The server container runs as root, which violates CIS Benchmark
Level 1 and will be blocked once Pod Security Standards are enforced.
The client Dockerfile already handles this correctly with `USER nextjs`.

**File:** `server/Dockerfile`

Replace the production stage:

```dockerfile
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
COPY prisma ./prisma/

RUN npm ci
RUN npx prisma generate

COPY . .
RUN npm run build
RUN npm prune --omit=dev

# Production image
FROM node:22-alpine AS runner

RUN apk add --no-cache openssl

# Create non-root user (mirrors what the client Dockerfile does)
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 --ingroup nodejs appuser

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json* ./
COPY prisma ./prisma/

RUN npm ci --omit=dev
RUN npx prisma generate

COPY --from=builder --chown=appuser:nodejs /app/dist ./dist

USER appuser

EXPOSE 5000

CMD ["npm", "start"]
```

**Verify:**
```bash
docker build -t inkframe/server ./server
docker run --rm inkframe/server whoami
# Expected: appuser
```

---

### 1.3 Configure Jest + Supertest on the server

**Why:** Zero tests exist. CI cannot enforce quality or catch regressions.
Jest with Supertest lets you test Express routes without a running server.

#### Install dependencies

```bash
cd server
npm install --save-dev \
  jest \
  ts-jest \
  @types/jest \
  supertest \
  @types/supertest
```

#### Create `server/jest.config.ts`

```typescript
import type { Config } from 'jest'

const config: Config = {
    preset: 'ts-jest/presets/default-esm',
    testEnvironment: 'node',
    extensionsToTreatAsEsm: ['.ts'],
    moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.js$': '$1',
    },
    transform: {
        '^.+\\.tsx?$': ['ts-jest', {
            useESM: true,
            tsconfig: {
                module: 'ESNext',
                moduleResolution: 'bundler',
            },
        }],
    },
    testMatch: ['**/__tests__/**/*.test.ts'],
    collectCoverageFrom: [
        'src/**/*.ts',
        '!src/**/*.d.ts',
    ],
    coverageThreshold: {
        global: {
            branches: 60,
            functions: 60,
            lines: 60,
            statements: 60,
        },
    },
    setupFilesAfterFramework: [],
}

export default config
```

#### Add test script to `server/package.json`

```json
"scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js",
    "build": "tsc",
    "test": "NODE_ENV=test jest",
    "test:coverage": "NODE_ENV=test jest --coverage",
    "postinstall": "prisma generate"
}
```

#### Create `server/src/__tests__/health.test.ts`

```typescript
import request from 'supertest'
import app from '../index.js'

describe('GET /health', () => {
    it('returns 200 with status ok', async () => {
        const res = await request(app).get('/health')
        expect(res.status).toBe(200)
        expect(res.body.status).toBe('ok')
        expect(res.body.timestamp).toBeDefined()
    })
})
```

#### Create `server/src/__tests__/auth.test.ts`

```typescript
import request from 'supertest'
import app from '../index.js'

describe('POST /api/auth/register', () => {
    it('returns 400 when body is empty', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({})
        expect(res.status).toBe(400)
    })

    it('returns 400 when email is missing', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({ password: 'test1234' })
        expect(res.status).toBe(400)
    })
})

describe('POST /api/auth/login', () => {
    it('returns 400 when body is empty', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({})
        expect(res.status).toBe(400)
    })
})
```

**Verify:**
```bash
cd server
npm test
# All tests should pass
npm run test:coverage
```

---

## Phase 2 — CI/CD Pipeline

Create the `.github/workflows/` directory and three workflow files.

```bash
mkdir -p .github/workflows
```

---

### 2.1 CI Workflow — `.github/workflows/ci.yml`

Triggers on every push and pull request. Runs lint, tests, builds Docker images,
and scans them for vulnerabilities.

```yaml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

env:
  NODE_VERSION: '22'

jobs:
  lint-and-test:
    name: Lint and Test
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
          cache-dependency-path: |
            server/package-lock.json
            client/package-lock.json

      - name: Install server dependencies
        working-directory: server
        run: npm ci

      - name: Install client dependencies
        working-directory: client
        run: npm ci

      - name: Lint client
        working-directory: client
        run: npm run lint

      - name: Run server tests
        working-directory: server
        run: npm run test:coverage

      - name: Upload coverage report
        uses: actions/upload-artifact@v4
        with:
          name: coverage-report
          path: server/coverage/

  build-and-scan:
    name: Build and Scan Images
    runs-on: ubuntu-latest
    needs: lint-and-test

    steps:
      - uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Build server image
        uses: docker/build-push-action@v5
        with:
          context: ./server
          push: false
          tags: inkframe/server:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
          outputs: type=docker,dest=/tmp/server.tar

      - name: Build client image
        uses: docker/build-push-action@v5
        with:
          context: ./client
          push: false
          tags: inkframe/client:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
          outputs: type=docker,dest=/tmp/client.tar

      - name: Load images
        run: |
          docker load --input /tmp/server.tar
          docker load --input /tmp/client.tar

      - name: Run Trivy on server image
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: inkframe/server:${{ github.sha }}
          format: 'sarif'
          output: 'trivy-server.sarif'
          severity: 'HIGH,CRITICAL'
          exit-code: '1'

      - name: Run Trivy on client image
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: inkframe/client:${{ github.sha }}
          format: 'sarif'
          output: 'trivy-client.sarif'
          severity: 'HIGH,CRITICAL'
          exit-code: '1'

      - name: Upload Trivy SARIF results
        uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: '.'
```

---

### 2.2 CD Workflow — `.github/workflows/deploy.yml`

Deploys to staging automatically on push to `main`. Production requires manual
approval via GitHub Environments.

**Before using this workflow:**
1. In GitHub → Settings → Environments, create two environments: `staging` and `production`
2. On `production`, enable "Required reviewers" and add yourself
3. Add the secrets listed below to your repo

**Required GitHub Secrets (`Settings → Secrets → Actions`):**

| Secret | Value |
|---|---|
| `AWS_ROLE_ARN` | ARN of the OIDC role (see below for how to create it) |
| `ECR_REGISTRY` | `<account-id>.dkr.ecr.us-east-1.amazonaws.com` |
| `EKS_CLUSTER_NAME` | `inkframe-production-eks` |
| `AWS_REGION` | `us-east-1` |

```yaml
name: Deploy

on:
  push:
    branches: [main]
  workflow_dispatch:
    inputs:
      environment:
        description: 'Target environment'
        required: true
        default: 'staging'
        type: choice
        options: [staging, production]

permissions:
  id-token: write   # required for OIDC
  contents: read

jobs:
  deploy-staging:
    name: Deploy to Staging
    runs-on: ubuntu-latest
    environment: staging
    if: github.ref == 'refs/heads/main'

    steps:
      - uses: actions/checkout@v4

      - name: Configure AWS credentials (OIDC)
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_ARN }}
          aws-region: ${{ secrets.AWS_REGION }}

      - name: Login to Amazon ECR
        id: login-ecr
        uses: aws-actions/amazon-ecr-login@v2

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Build and push server
        uses: docker/build-push-action@v5
        with:
          context: ./server
          push: true
          tags: |
            ${{ secrets.ECR_REGISTRY }}/inkframe/server:${{ github.sha }}
            ${{ secrets.ECR_REGISTRY }}/inkframe/server:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Build and push client
        uses: docker/build-push-action@v5
        with:
          context: ./client
          push: true
          tags: |
            ${{ secrets.ECR_REGISTRY }}/inkframe/client:${{ github.sha }}
            ${{ secrets.ECR_REGISTRY }}/inkframe/client:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Update kubeconfig
        run: |
          aws eks update-kubeconfig \
            --region ${{ secrets.AWS_REGION }} \
            --name ${{ secrets.EKS_CLUSTER_NAME }}

      - name: Update image tags in manifests
        run: |
          TAG=${{ github.sha }}
          REGISTRY=${{ secrets.ECR_REGISTRY }}
          sed -i "s|<AWS_ACCOUNT_ID>.dkr.ecr.<REGION>.amazonaws.com/inkframe/server:latest|${REGISTRY}/inkframe/server:${TAG}|g" \
            terraform/k8s/server-deployment.yaml
          sed -i "s|<AWS_ACCOUNT_ID>.dkr.ecr.<REGION>.amazonaws.com/inkframe/client:latest|${REGISTRY}/inkframe/client:${TAG}|g" \
            terraform/k8s/client-deployment.yaml
          sed -i "s|<AWS_ACCOUNT_ID>.dkr.ecr.<REGION>.amazonaws.com/inkframe/server:latest|${REGISTRY}/inkframe/server:${TAG}|g" \
            terraform/k8s/db-migration-job.yaml

      - name: Run database migrations
        run: |
          # Delete any previous migration job and re-apply
          kubectl delete job prisma-migrate -n inkframe --ignore-not-found
          kubectl apply -f terraform/k8s/db-migration-job.yaml
          kubectl wait --for=condition=complete job/prisma-migrate \
            -n inkframe --timeout=120s

      - name: Apply Kubernetes manifests
        run: kubectl apply -f terraform/k8s/

      - name: Wait for rollout
        run: |
          kubectl rollout status deployment/server -n inkframe --timeout=300s
          kubectl rollout status deployment/client -n inkframe --timeout=300s

      - name: Smoke test
        run: |
          # Wait for ALB to be ready
          sleep 30
          SERVER_URL=$(kubectl get ingress server-ingress -n inkframe \
            -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')
          curl --fail --max-time 10 "http://${SERVER_URL}/health" \
            || (echo "Health check failed" && exit 1)

  deploy-production:
    name: Deploy to Production
    runs-on: ubuntu-latest
    environment: production
    needs: deploy-staging
    if: github.event_name == 'workflow_dispatch' && github.event.inputs.environment == 'production'

    steps:
      # Same steps as deploy-staging above
      # Copy the steps block from deploy-staging and paste here
      - run: echo "Production deploy — copy steps from deploy-staging above"
```

---

### 2.3 How to Create the GitHub OIDC Role (one-time setup)

This eliminates long-lived AWS access keys in GitHub secrets.

```bash
# Get your AWS account ID
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
GITHUB_ORG="your-github-username-or-org"
REPO_NAME="Inkframe"

# Create the OIDC identity provider (one-time per account)
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1

# Create the trust policy
cat > /tmp/trust-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::${ACCOUNT_ID}:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:${GITHUB_ORG}/${REPO_NAME}:*"
        }
      }
    }
  ]
}
EOF

# Create the CI role
aws iam create-role \
  --role-name inkframe-github-ci \
  --assume-role-policy-document file:///tmp/trust-policy.json

# Attach necessary policies
aws iam attach-role-policy \
  --role-name inkframe-github-ci \
  --policy-arn arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryPowerUser

aws iam attach-role-policy \
  --role-name inkframe-github-ci \
  --policy-arn arn:aws:iam::aws:policy/AmazonEKSClusterPolicy

# Get the ARN to put in GitHub Secrets
aws iam get-role --role-name inkframe-github-ci \
  --query Role.Arn --output text
```

Copy the ARN output → GitHub → Settings → Secrets → `AWS_ROLE_ARN`.

---

### 2.4 Security Scanning Workflow — `.github/workflows/security.yml`

Runs daily and on every PR. Finds vulnerable dependencies and leaked secrets.

```yaml
name: Security Scan

on:
  schedule:
    - cron: '0 6 * * *'   # 06:00 UTC daily
  pull_request:
    branches: [main, develop]
  workflow_dispatch:

permissions:
  contents: read
  security-events: write

jobs:
  dependency-audit:
    name: Dependency Audit
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Audit server dependencies
        working-directory: server
        run: npm audit --audit-level=high

      - name: Audit client dependencies
        working-directory: client
        run: npm audit --audit-level=high

  secret-scan:
    name: Secret Scanning
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0   # full history for secret scanning

      - name: Run Gitleaks
        uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

  trivy-fs-scan:
    name: Trivy Filesystem Scan
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Run Trivy on filesystem
        uses: aquasecurity/trivy-action@master
        with:
          scan-type: 'fs'
          scan-ref: '.'
          format: 'sarif'
          output: 'trivy-fs.sarif'
          severity: 'HIGH,CRITICAL'

      - name: Upload SARIF
        uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: trivy-fs.sarif
```

---

## Phase 3 — Security Hardening

---

### 3.1 Kubernetes NetworkPolicies

**Why:** By default, every pod can talk to every other pod in the cluster.
NetworkPolicies restrict this to only the connections that are actually needed.

**File:** `terraform/k8s/network-policies.yaml`

```yaml
# Default deny all ingress and egress in the inkframe namespace
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-all
  namespace: inkframe
spec:
  podSelector: {}
  policyTypes:
    - Ingress
    - Egress
---
# Allow DNS resolution for all pods (required for any external calls)
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-dns
  namespace: inkframe
spec:
  podSelector: {}
  policyTypes:
    - Egress
  egress:
    - ports:
        - port: 53
          protocol: UDP
        - port: 53
          protocol: TCP
---
# Allow the ALB ingress controller to reach the client on port 3000
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-ingress-to-client
  namespace: inkframe
spec:
  podSelector:
    matchLabels:
      app: client
  policyTypes:
    - Ingress
  ingress:
    - ports:
        - port: 3000
---
# Allow the ALB ingress controller to reach the server on port 5000
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-ingress-to-server
  namespace: inkframe
spec:
  podSelector:
    matchLabels:
      app: server
  policyTypes:
    - Ingress
  ingress:
    - ports:
        - port: 5000
---
# Allow client pods to call server pods
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-client-to-server
  namespace: inkframe
spec:
  podSelector:
    matchLabels:
      app: server
  policyTypes:
    - Ingress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: client
      ports:
        - port: 5000
---
# Allow server pods outbound to RDS (port 5432) and Redis (port 6379)
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-server-egress
  namespace: inkframe
spec:
  podSelector:
    matchLabels:
      app: server
  policyTypes:
    - Egress
  egress:
    - ports:
        - port: 5432    # RDS PostgreSQL
        - port: 6379    # ElastiCache Redis
        - port: 443     # AWS APIs (Secrets Manager, S3, etc.)
```

Apply:
```bash
kubectl apply -f terraform/k8s/network-policies.yaml
```

Verify policies are created:
```bash
kubectl get networkpolicies -n inkframe
```

---

### 3.2 Pod Security Standards

**Why:** PSS prevents containers from running as root, requesting host
namespaces, or using other dangerous capabilities at the namespace level.

Add the enforcement label to the namespace:

**File:** `terraform/k8s/namespace.yaml`

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: inkframe
  labels:
    app.kubernetes.io/name: inkframe
    pod-security.kubernetes.io/enforce: baseline      # blocks root containers, hostPath, etc.
    pod-security.kubernetes.io/warn: restricted        # warns on anything stricter
    pod-security.kubernetes.io/audit: restricted
```

> Start with `baseline` — it blocks the worst offenders without requiring
> `readOnlyRootFilesystem` yet. Upgrade to `restricted` after auditing all pods.

Apply:
```bash
kubectl apply -f terraform/k8s/namespace.yaml
```

After the server Dockerfile fix from 1.2 is deployed, upgrade to `restricted`:
```bash
kubectl label namespace inkframe \
  pod-security.kubernetes.io/enforce=restricted \
  --overwrite
```

---

### 3.3 ResourceQuota and PodDisruptionBudget

**Why:** ResourceQuotas prevent a runaway deployment from consuming the entire
cluster. PodDisruptionBudgets prevent Kubernetes from taking all replicas down
at once during node maintenance.

**File:** `terraform/k8s/resource-quota.yaml`

```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: inkframe-quota
  namespace: inkframe
spec:
  hard:
    requests.cpu: "4"
    requests.memory: 8Gi
    limits.cpu: "8"
    limits.memory: 16Gi
    pods: "20"
    persistentvolumeclaims: "5"
---
# Guarantee at least 1 server pod survives during node drains
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: server-pdb
  namespace: inkframe
spec:
  minAvailable: 1
  selector:
    matchLabels:
      app: server
---
# Guarantee at least 1 client pod survives during node drains
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: client-pdb
  namespace: inkframe
spec:
  minAvailable: 1
  selector:
    matchLabels:
      app: client
```

Apply:
```bash
kubectl apply -f terraform/k8s/resource-quota.yaml
kubectl get resourcequota -n inkframe
kubectl get pdb -n inkframe
```

---

### 3.4 ESLint Security Plugin

**Why:** Catches dangerous patterns (eval, unsafe regex, command injection
risks) before code is committed.

#### Server

```bash
cd server
npm install --save-dev eslint eslint-plugin-security @typescript-eslint/eslint-plugin @typescript-eslint/parser
```

Create `server/eslint.config.js`:

```javascript
import security from 'eslint-plugin-security'
import tsPlugin from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'

export default [
    {
        files: ['src/**/*.ts'],
        plugins: {
            security,
            '@typescript-eslint': tsPlugin,
        },
        languageOptions: {
            parser: tsParser,
            parserOptions: {
                ecmaVersion: 2022,
                sourceType: 'module',
            },
        },
        rules: {
            ...security.configs.recommended.rules,
            ...tsPlugin.configs.recommended.rules,
        },
    },
]
```

Add lint script to `server/package.json`:
```json
"lint": "eslint src/"
```

#### Client

The client already has ESLint. Add the security plugin:

```bash
cd client
npm install --save-dev eslint-plugin-security
```

Add to `client/eslint.config.mjs` (or `.eslintrc.js` depending on what exists):
```javascript
import security from 'eslint-plugin-security'

// Add to the plugins and rules sections:
// plugins: { security }
// rules: { ...security.configs.recommended.rules }
```

Run:
```bash
cd server && npm run lint
cd ../client && npm run lint
```

---

### 3.5 AWS WAF on the ALB

**Why:** The ALB is publicly internet-facing. WAF blocks SQLi, XSS, and known
bad actors at the edge before they reach the application.

Add to `terraform/main.tf`:

```hcl
# WAF Web ACL
resource "aws_wafv2_web_acl" "inkframe" {
  name  = "${local.name_prefix}-waf"
  scope = "REGIONAL"

  default_action {
    allow {}
  }

  rule {
    name     = "AWSManagedRulesCommonRuleSet"
    priority = 1
    override_action { none {} }
    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "CommonRuleSet"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "AWSManagedRulesSQLiRuleSet"
    priority = 2
    override_action { none {} }
    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesSQLiRuleSet"
        vendor_name = "AWS"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "SQLiRuleSet"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "AWSManagedRulesKnownBadInputsRuleSet"
    priority = 3
    override_action { none {} }
    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesKnownBadInputsRuleSet"
        vendor_name = "AWS"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "KnownBadInputs"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${local.name_prefix}-waf"
    sampled_requests_enabled   = true
  }

  tags = local.common_tags
}

# Associate WAF with ALB (ALB ARN comes from the ingress after it's created)
# Run this after the ALB is provisioned:
# aws wafv2 associate-web-acl \
#   --web-acl-arn <WAF_ACL_ARN> \
#   --resource-arn <ALB_ARN> \
#   --region us-east-1
```

Apply:
```bash
cd terraform
terraform plan -target=aws_wafv2_web_acl.inkframe
terraform apply -target=aws_wafv2_web_acl.inkframe

# Get the ALB ARN from the ingress
ALB_ARN=$(aws elbv2 describe-load-balancers \
  --query "LoadBalancers[?contains(LoadBalancerName, 'inkframe')].LoadBalancerArn" \
  --output text)

WAF_ARN=$(terraform output -raw waf_web_acl_arn)

aws wafv2 associate-web-acl \
  --web-acl-arn "$WAF_ARN" \
  --resource-arn "$ALB_ARN" \
  --region us-east-1
```

---

## Phase 4 — Observability

---

### 4.1 Deploy kube-prometheus-stack via Helm (Terraform)

**Why:** Provides Prometheus (metrics storage), Grafana (dashboards), and
Alertmanager (alerting) in one Helm chart.

Add to `terraform/main.tf`:

```hcl
resource "helm_release" "kube_prometheus_stack" {
  name             = "kube-prometheus-stack"
  repository       = "https://prometheus-community.github.io/helm-charts"
  chart            = "kube-prometheus-stack"
  version          = "65.1.1"    # pin a version; check for latest before deploying
  namespace        = "monitoring"
  create_namespace = true

  set {
    name  = "grafana.enabled"
    value = "true"
  }

  set {
    name  = "grafana.adminPassword"
    value = var.grafana_admin_password    # add this variable to variables.tf
  }

  set {
    name  = "prometheus.prometheusSpec.retention"
    value = "30d"
  }

  set {
    name  = "prometheus.prometheusSpec.storageSpec.volumeClaimTemplate.spec.resources.requests.storage"
    value = "50Gi"
  }

  # Scrape all namespaces
  set {
    name  = "prometheus.prometheusSpec.podMonitorSelectorNilUsesHelmValues"
    value = "false"
  }

  set {
    name  = "prometheus.prometheusSpec.serviceMonitorSelectorNilUsesHelmValues"
    value = "false"
  }

  depends_on = [module.eks]
}
```

Add to `terraform/variables.tf`:
```hcl
variable "grafana_admin_password" {
  description = "Grafana admin password"
  type        = string
  sensitive   = true
}
```

Apply:
```bash
cd terraform
terraform apply -target=helm_release.kube_prometheus_stack

# Access Grafana locally
kubectl port-forward -n monitoring svc/kube-prometheus-stack-grafana 3001:80
# Open http://localhost:3001  admin / <your grafana_admin_password>
```

---

### 4.2 Instrument the server with `prom-client`

**Why:** Exposes HTTP request rates, latency histograms, and error rates from
the Express server to Prometheus.

```bash
cd server
npm install prom-client
```

Create `server/src/middleware/metrics.ts`:

```typescript
import { Registry, collectDefaultMetrics, Counter, Histogram } from 'prom-client'
import type { Request, Response, NextFunction } from 'express'

export const register = new Registry()

collectDefaultMetrics({ register })

export const httpRequestsTotal = new Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status_code'],
    registers: [register],
})

export const httpRequestDurationSeconds = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [register],
})

export function metricsMiddleware(req: Request, res: Response, next: NextFunction) {
    const end = httpRequestDurationSeconds.startTimer()
    res.on('finish', () => {
        const route = req.route?.path ?? req.path
        const labels = {
            method: req.method,
            route,
            status_code: String(res.statusCode),
        }
        httpRequestsTotal.inc(labels)
        end(labels)
    })
    next()
}
```

Update `server/src/index.ts` to expose the `/metrics` endpoint:

```typescript
import { metricsMiddleware, register } from './middleware/metrics.js'

// After app.use(express.json(...))
app.use(metricsMiddleware)

// Metrics endpoint — only accessible within the cluster (not through ingress)
app.get('/metrics', async (_req, res) => {
    res.set('Content-Type', register.contentType)
    res.end(await register.metrics())
})
```

---

### 4.3 ServiceMonitor for Prometheus scraping

**File:** `terraform/k8s/servicemonitor.yaml`

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: inkframe-server
  namespace: inkframe
  labels:
    release: kube-prometheus-stack    # must match Prometheus selector
spec:
  selector:
    matchLabels:
      app: server
  endpoints:
    - port: http
      path: /metrics
      interval: 30s
```

Apply:
```bash
kubectl apply -f terraform/k8s/servicemonitor.yaml

# Verify Prometheus is discovering the target
kubectl port-forward -n monitoring svc/kube-prometheus-stack-prometheus 9090:9090
# Open http://localhost:9090/targets — inkframe/server should appear as UP
```

---

### 4.4 Alertmanager Rules

**File:** `terraform/k8s/alerting-rules.yaml`

```yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: inkframe-alerts
  namespace: inkframe
  labels:
    release: kube-prometheus-stack
spec:
  groups:
    - name: inkframe.application
      rules:
        - alert: HighErrorRate
          expr: |
            sum(rate(http_requests_total{status_code=~"5.."}[5m]))
            /
            sum(rate(http_requests_total[5m])) > 0.01
          for: 2m
          labels:
            severity: critical
          annotations:
            summary: "High 5xx error rate ({{ $value | humanizePercentage }})"
            description: "More than 1% of requests are returning 5xx errors."

        - alert: HighLatency
          expr: |
            histogram_quantile(0.95,
              sum(rate(http_request_duration_seconds_bucket[5m])) by (le)
            ) > 2
          for: 5m
          labels:
            severity: warning
          annotations:
            summary: "P95 latency above 2 seconds"
            description: "95th percentile latency is {{ $value }}s."

        - alert: PodCrashLooping
          expr: rate(kube_pod_container_status_restarts_total{namespace="inkframe"}[15m]) * 60 * 15 > 0
          for: 5m
          labels:
            severity: critical
          annotations:
            summary: "Pod {{ $labels.pod }} is crash looping"

        - alert: DeploymentReplicasMismatch
          expr: |
            kube_deployment_spec_replicas{namespace="inkframe"}
            != kube_deployment_status_available_replicas{namespace="inkframe"}
          for: 10m
          labels:
            severity: warning
          annotations:
            summary: "Deployment {{ $labels.deployment }} has fewer replicas than desired"
```

Apply:
```bash
kubectl apply -f terraform/k8s/alerting-rules.yaml
```

---

### 4.5 Configure Alertmanager to send Slack notifications

Create a Kubernetes secret with your Slack webhook URL:

```bash
kubectl create secret generic alertmanager-slack \
  --namespace monitoring \
  --from-literal=webhook-url="https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK"
```

Create `terraform/k8s/alertmanager-config.yaml`:

```yaml
apiVersion: monitoring.coreos.com/v1alpha1
kind: AlertmanagerConfig
metadata:
  name: inkframe-alerts
  namespace: inkframe
  labels:
    alertmanagerConfig: inkframe
spec:
  route:
    groupBy: ['alertname', 'namespace']
    groupWait: 30s
    groupInterval: 5m
    repeatInterval: 12h
    receiver: slack-notifications

  receivers:
    - name: slack-notifications
      slackConfigs:
        - apiURL:
            name: alertmanager-slack
            key: webhook-url
          channel: '#inkframe-alerts'
          sendResolved: true
          title: '[{{ .Status | toUpper }}] {{ .GroupLabels.alertname }}'
          text: |
            {{ range .Alerts }}
            *Alert:* {{ .Annotations.summary }}
            *Description:* {{ .Annotations.description }}
            *Severity:* {{ .Labels.severity }}
            {{ end }}
```

Apply:
```bash
kubectl apply -f terraform/k8s/alertmanager-config.yaml
```

---

### 4.6 Add Grafana dashboards

Import these dashboards by ID in the Grafana UI (Dashboards → Import):

| Dashboard | ID | What it shows |
|---|---|---|
| Kubernetes Cluster Overview | `7249` | Node CPU/memory, pod counts |
| Node Exporter Full | `1860` | Per-node disk, network, CPU |
| Kubernetes Deployments | `8588` | Rollout history, replica status |
| Express.js metrics | Create custom | From `prom-client` metrics above |

For the Express.js custom dashboard, create panels for:
- `rate(http_requests_total[5m])` — requests per second by route
- `histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))` — P95 latency
- `rate(http_requests_total{status_code=~"5.."}[5m])` — error rate

---

## Phase 5 — Disaster Recovery

---

### 5.1 Cross-Region RDS Snapshot Replication

Add to `terraform/modules/rds/main.tf`:

```hcl
# Automated cross-region snapshot copy
resource "aws_db_instance_automated_backups_replication" "cross_region" {
  source_db_instance_arn = aws_db_instance.main.arn
  retention_period       = 7

  provider = aws.dr_region    # secondary region provider
}
```

Add to `terraform/versions.tf`:

```hcl
provider "aws" {
  alias  = "dr_region"
  region = var.dr_region    # e.g. "us-west-2"
}
```

Add to `terraform/variables.tf`:

```hcl
variable "dr_region" {
  description = "Secondary AWS region for disaster recovery"
  type        = string
  default     = "us-west-2"
}
```

---

### 5.2 RDS Point-in-Time Recovery procedure

```bash
# List available restore times
aws rds describe-db-instances \
  --db-instance-identifier <your-db-identifier> \
  --query "DBInstances[0].{EarliestRestoreTime:ReadReplicaSourceDBInstanceIdentifier,LatestRestoreTime:LatestRestorableTime}"

# Restore to a point in time (creates a NEW instance — does not overwrite the existing one)
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier inkframe-production-db \
  --target-db-instance-identifier inkframe-restored-$(date +%Y%m%d) \
  --restore-time "2026-03-07T03:00:00Z" \
  --db-instance-class db.t3.medium \
  --multi-az \
  --region us-east-1

# Monitor restore status
aws rds describe-db-instances \
  --db-instance-identifier inkframe-restored-$(date +%Y%m%d) \
  --query "DBInstances[0].DBInstanceStatus"

# Once available, get the new endpoint
aws rds describe-db-instances \
  --db-instance-identifier inkframe-restored-$(date +%Y%m%d) \
  --query "DBInstances[0].Endpoint.Address" \
  --output text

# Update the DATABASE_URL secret in Secrets Manager to point to restored instance
# Then restart server pods to pick up the new connection string
kubectl rollout restart deployment/server -n inkframe
```

---

### 5.3 Terraform State Recovery

```bash
# List all state versions in S3
aws s3api list-object-versions \
  --bucket inkframe-terraform-state-your-name \
  --prefix inkframe/eks/terraform.tfstate \
  --query "Versions[*].{VersionId:VersionId,LastModified:LastModified}"

# Restore a specific version
aws s3api get-object \
  --bucket inkframe-terraform-state-your-name \
  --key inkframe/eks/terraform.tfstate \
  --version-id <VERSION_ID> \
  terraform.tfstate.backup

# Replace the current state with the backup
aws s3 cp terraform.tfstate.backup \
  s3://inkframe-terraform-state-your-name/inkframe/eks/terraform.tfstate

# Verify state is consistent
cd terraform
terraform plan   # should show 0 changes if state matches reality
```

---

### 5.4 Monthly Backup Validation Checklist

Run this on the first Monday of each month:

```bash
#!/usr/bin/env bash
# save as scripts/validate-backups.sh

set -euo pipefail

echo "=== Inkframe Backup Validation $(date) ==="

# 1. Check RDS automated backup exists within last 24h
echo "--- RDS Snapshots ---"
aws rds describe-db-snapshots \
  --db-instance-identifier inkframe-production-db \
  --snapshot-type automated \
  --query "DBSnapshots[0].{Status:Status,SnapshotCreateTime:SnapshotCreateTime}" \
  --output table

# 2. Check Redis snapshots
echo "--- Redis Snapshots ---"
aws elasticache describe-snapshots \
  --replication-group-id inkframe-production-redis \
  --query "Snapshots[0].{Status:SnapshotStatus,NodeSnapshots:NodeSnapshots[0].SnapshotCreateTime}" \
  --output table

# 3. Check Terraform state is recent
echo "--- Terraform State ---"
aws s3api head-object \
  --bucket inkframe-terraform-state-your-name \
  --key inkframe/eks/terraform.tfstate \
  --query "LastModified"

echo "=== Validation Complete ==="
```

---

## Summary Checklist

Use this to track implementation progress:

### Phase 1 — Critical Blockers
- [ ] `server/src/index.ts` — `/health` route added
- [ ] `server/Dockerfile` — non-root USER added
- [ ] `server/jest.config.ts` — Jest configured
- [ ] `server/src/__tests__/` — baseline tests passing

### Phase 2 — CI/CD
- [ ] `.github/workflows/ci.yml` — lint, test, build, scan
- [ ] `.github/workflows/deploy.yml` — ECR push, K8s rollout, smoke test
- [ ] `.github/workflows/security.yml` — daily audit + secret scan
- [ ] GitHub OIDC role created, `AWS_ROLE_ARN` secret set
- [ ] GitHub Environments `staging` and `production` created

### Phase 3 — Security
- [ ] `terraform/k8s/network-policies.yaml` — applied
- [ ] `terraform/k8s/namespace.yaml` — PSS label set to `baseline`, then `restricted`
- [ ] `terraform/k8s/resource-quota.yaml` — ResourceQuota + PodDisruptionBudget applied
- [ ] `eslint-plugin-security` — installed and running on server and client
- [ ] WAF Web ACL — created and associated with ALB

### Phase 4 — Observability
- [ ] `kube-prometheus-stack` — deployed via Helm in Terraform
- [ ] `prom-client` — instrumented in server
- [ ] `terraform/k8s/servicemonitor.yaml` — server metrics scraped by Prometheus
- [ ] `terraform/k8s/alerting-rules.yaml` — alert rules applied
- [ ] Slack/PagerDuty receiver configured in Alertmanager
- [ ] Grafana dashboards imported

### Phase 5 — Disaster Recovery
- [ ] Cross-region RDS snapshot replication enabled in Terraform
- [ ] PITR restoration procedure tested
- [ ] Terraform state recovery procedure tested
- [ ] `scripts/validate-backups.sh` — added to cron / scheduled GitHub Action

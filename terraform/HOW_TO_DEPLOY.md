# How to Deploy Inkframe on AWS EKS — Beginner's Guide

This guide walks you through deploying the full Inkframe stack to AWS using
Terraform and Kubernetes. By the end you will have a production-grade cluster
running on AWS with a managed database, Redis, and auto-scaling containers.

---

## What You Will Need

Before you start, install and configure the following tools on your laptop.

### Required tools

| Tool | What it does | Install guide |
|---|---|---|
| **AWS CLI v2** | Talks to your AWS account from the terminal | https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html |
| **Terraform ≥ 1.6** | Provisions the AWS infrastructure | https://developer.hashicorp.com/terraform/install |
| **kubectl** | Manages Kubernetes resources | https://kubernetes.io/docs/tasks/tools/ |
| **Helm** | Installs pre-packaged Kubernetes apps | https://helm.sh/docs/intro/install/ |
| **Git** | Source control | https://git-scm.com/downloads |

### Check everything is installed

Run each command — you should see a version number, not an error.

```bash
aws --version
terraform --version
kubectl version --client
helm version
git --version
```

---

## Step 1 — Set Up Your AWS Account

### 1a. Create an AWS account

If you do not have one, go to https://aws.amazon.com and sign up. You will need
a credit card. New accounts get a free tier that covers some of these resources
for the first 12 months, but EKS itself costs ~$0.10/hour for the control plane.

### 1b. Create an IAM user for Terraform

Never use your root account for day-to-day work. Instead:

1. Log in to the AWS Console → search for **IAM** → click **Users** → **Create user**
2. Name it `terraform-deployer`
3. Select **Attach policies directly** and attach:
   - `AdministratorAccess` *(simplest for a first deploy; restrict further later)*
4. Click through to **Create user**
5. Click the new user → **Security credentials** → **Create access key**
6. Choose **Command Line Interface (CLI)** → create
7. **Save the Access Key ID and Secret Access Key** — you cannot view the secret again

### 1c. Configure the AWS CLI

```bash
aws configure
```

Enter when prompted:
```
AWS Access Key ID:     <paste your access key ID>
AWS Secret Access Key: <paste your secret access key>
Default region name:   us-east-1
Default output format: json
```

Verify it works:

```bash
aws sts get-caller-identity
```

You should see your account ID and the `terraform-deployer` username.

---

## Step 2 — Create the Terraform State Bucket

Terraform saves a record of everything it has created in a **state file**.
We store this in S3 so your whole team shares the same state and it is never
lost if your laptop breaks.

### 2a. Create an S3 bucket

Replace `your-name` with something unique (bucket names are global):

```bash
aws s3api create-bucket \
  --bucket inkframe-terraform-state-your-name \
  --region us-east-1
```

Enable versioning (lets you roll back to a previous state):

```bash
aws s3api put-bucket-versioning \
  --bucket inkframe-terraform-state-your-name \
  --versioning-configuration Status=Enabled
```

Enable encryption:

```bash
aws s3api put-bucket-encryption \
  --bucket inkframe-terraform-state-your-name \
  --server-side-encryption-configuration '{
    "Rules": [{
      "ApplyServerSideEncryptionByDefault": {
        "SSEAlgorithm": "AES256"
      }
    }]
  }'
```

Block all public access:

```bash
aws s3api put-public-access-block \
  --bucket inkframe-terraform-state-your-name \
  --public-access-block-configuration \
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
```

### 2b. Create a DynamoDB table for state locking

This prevents two people running `terraform apply` at the same time and
corrupting the state file.

```bash
aws dynamodb create-table \
  --table-name terraform-locks \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region us-east-1
```

---

## Step 3 — Configure the Terraform Backend

Open `terraform/versions.tf` in a text editor and fill in the `backend "s3"`
block with your real values:

```hcl
backend "s3" {
  bucket         = "inkframe-terraform-state-your-name"  # your bucket name
  key            = "inkframe/eks/terraform.tfstate"
  region         = "us-east-1"
  dynamodb_table = "terraform-locks"
  encrypt        = true
}
```

Save the file.

---

## Step 4 — Create Your Variables File

Terraform reads configuration from a `terraform.tfvars` file. We provide an
example to get you started.

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars
```

Open `terraform.tfvars` in a text editor. The defaults are fine for a first
deploy. The only things you **must** change are:

```hcl
# If you own a domain, set it here. Otherwise leave as empty string "".
domain_name = "yourdomain.com"

# Set to false if you do not want deletion protection while testing
# (makes it easier to tear down). Set back to true for real production use.
db_deletion_protection = false
```

> **Important:** `terraform.tfvars` is listed in `.gitignore`. Never commit it
> — it may contain sensitive values.

---

## Step 5 — Initialise Terraform

This downloads all the provider plugins (AWS, Kubernetes, Helm, etc.) and
connects to your S3 backend.

```bash
# Make sure you are inside the terraform/ directory
cd terraform

terraform init
```

You should see:

```
Terraform has been successfully initialized!
```

If you see an error about the S3 bucket, double-check Step 2 and Step 3.

---

## Step 6 — Preview the Changes

Before creating anything, ask Terraform to show you exactly what it will build.
This is safe — it makes no changes.

```bash
terraform plan
```

Read through the output. Lines starting with `+` mean "will be created".
The summary at the bottom will say something like:

```
Plan: 87 to add, 0 to change, 0 to destroy.
```

That number is normal — there are many small AWS resources that make up the
full stack.

---

## Step 7 — Apply the Infrastructure

This is the step that creates real AWS resources and **costs money**.

```bash
terraform apply
```

Terraform will print the plan again and ask:

```
Do you want to perform these actions? Enter a value:
```

Type `yes` and press Enter.

> **How long does this take?**
> - VPC and networking: ~2 minutes
> - EKS cluster: ~12–15 minutes (this is the longest step)
> - RDS instance: ~10 minutes
> - ElastiCache: ~5 minutes
> - Helm charts: ~3 minutes
>
> Total: roughly **25–35 minutes** on a first run.

When it finishes you will see something like:

```
Apply complete! Resources: 87 added, 0 changed, 0 destroyed.

Outputs:

configure_kubectl = "aws eks update-kubeconfig --region us-east-1 --name inkframe-production-eks"
ecr_repository_urls = {
  "client" = "123456789.dkr.ecr.us-east-1.amazonaws.com/inkframe/client"
  "server" = "123456789.dkr.ecr.us-east-1.amazonaws.com/inkframe/server"
}
rds_secret_arn  = "arn:aws:secretsmanager:..."
redis_secret_arn = "arn:aws:secretsmanager:..."
```

**Save these output values** — you will need the ECR URLs in the next step.

---

## Step 8 — Configure kubectl

`kubectl` is the command-line tool for talking to your Kubernetes cluster.
Run the command from the Terraform output:

```bash
aws eks update-kubeconfig --region us-east-1 --name inkframe-production-eks
```

Verify you can reach the cluster:

```bash
kubectl get nodes
```

You should see 2–4 nodes with status `Ready`.

---

## Step 9 — Build and Push Docker Images

Your app needs to be packaged as Docker images and pushed to ECR (AWS's
private container registry) before Kubernetes can run them.

### 9a. Authenticate Docker with ECR

```bash
aws ecr get-login-password --region us-east-1 \
  | docker login --username AWS --password-stdin \
    123456789.dkr.ecr.us-east-1.amazonaws.com
```

Replace `123456789` with your actual AWS account ID (visible in the ECR URLs
from Step 7).

### 9b. Build and push the server image

```bash
# From the repo root
cd server

docker build -t inkframe/server .

docker tag inkframe/server \
  123456789.dkr.ecr.us-east-1.amazonaws.com/inkframe/server:latest

docker push \
  123456789.dkr.ecr.us-east-1.amazonaws.com/inkframe/server:latest
```

### 9c. Build and push the client image

```bash
cd ../client

docker build -t inkframe/client .

docker tag inkframe/client \
  123456789.dkr.ecr.us-east-1.amazonaws.com/inkframe/client:latest

docker push \
  123456789.dkr.ecr.us-east-1.amazonaws.com/inkframe/client:latest
```

---

## Step 10 — Update Kubernetes Manifests With Your Image URLs

Open `terraform/k8s/server-deployment.yaml` and replace the placeholder image:

```yaml
# Change this line:
image: <AWS_ACCOUNT_ID>.dkr.ecr.<REGION>.amazonaws.com/inkframe/server:latest

# To your real ECR URL, for example:
image: 123456789.dkr.ecr.us-east-1.amazonaws.com/inkframe/server:latest
```

Do the same in `terraform/k8s/client-deployment.yaml` and
`terraform/k8s/db-migration-job.yaml`.

Also open `terraform/k8s/ingress.yaml` and replace the ACM certificate ARN
placeholder with your real certificate ARN (see Step 11 if you need one), or
remove the `certificate-arn` annotation and the `ssl-redirect` annotation if
you are not using HTTPS yet.

---

## Step 11 — (Optional) Request a TLS Certificate

If you own a domain name and want HTTPS, request a free certificate from AWS:

```bash
aws acm request-certificate \
  --domain-name yourdomain.com \
  --subject-alternative-names "*.yourdomain.com" \
  --validation-method DNS \
  --region us-east-1
```

AWS will give you a DNS record to add to your domain registrar.
Once validated (usually 5 minutes), copy the certificate ARN into
`terraform/k8s/ingress.yaml` where you see `<CERT_ID>`.

---

## Step 12 — Create Static App Secrets in Kubernetes

The deployment manifests reference a secret called `inkframe-static-secrets`
for values that are not stored in AWS Secrets Manager (JWT key, Stripe key,
Gemini API key). Create it manually:

```bash
kubectl create secret generic inkframe-static-secrets \
  --namespace inkframe \
  --from-literal=JWT_SECRET="your-very-long-random-jwt-secret" \
  --from-literal=GEMINI_API_KEY="your-gemini-api-key" \
  --from-literal=STRIPE_SECRET_KEY="your-stripe-secret-key"
```

> Generate a strong JWT secret with:
> ```bash
> openssl rand -base64 48
> ```

---

## Step 13 — Apply Kubernetes Manifests

```bash
kubectl apply -f terraform/k8s/
```

You should see:

```
namespace/inkframe configured
externalsecret.external-secrets.io/inkframe-app-secrets created
deployment.apps/server created
service/server created
horizontalpodautoscaler.autoscaling/server created
deployment.apps/client created
service/client created
horizontalpodautoscaler.autoscaling/client created
ingress.networking.k8s.io/client-ingress created
ingress.networking.k8s.io/server-ingress created
```

---

## Step 14 — Run Database Migrations

Before the server can use the database, Prisma needs to create the tables.
Apply the migration job:

```bash
kubectl apply -f terraform/k8s/db-migration-job.yaml

# Watch it run
kubectl logs -n inkframe -l app=prisma-migrate -f
```

You should see `Migrations complete.` at the end.

---

## Step 15 — Verify Everything Is Running

```bash
# Check all pods are Running (not Pending or CrashLoopBackOff)
kubectl get pods -n inkframe

# Check the ingress has received an external address (may take 2-3 minutes)
kubectl get ingress -n inkframe

# Check the server logs
kubectl logs -n inkframe -l app=server -f

# Check the client logs
kubectl logs -n inkframe -l app=client -f
```

A healthy pod list looks like:

```
NAME                      READY   STATUS    RESTARTS
client-7d9f8b6c4-abc12    1/1     Running   0
client-7d9f8b6c4-def34    1/1     Running   0
server-6c8d7f5b3-ghi56    1/1     Running   0
server-6c8d7f5b3-jkl78    1/1     Running   0
```

---

## Step 16 — Point Your Domain at the Load Balancer

Run:

```bash
kubectl get ingress -n inkframe
```

You will see an `ADDRESS` column with something like:

```
k8s-inkframe-abc123.us-east-1.elb.amazonaws.com
```

Go to your domain registrar (GoDaddy, Namecheap, Cloudflare, etc.) and add
two DNS records:

| Type | Name | Value |
|---|---|---|
| CNAME | `@` (or `yourdomain.com`) | the ELB address above |
| CNAME | `api` | the ELB address above |

DNS changes can take a few minutes to a few hours to propagate.

---

## Useful Day-to-Day Commands

```bash
# View all resources in the inkframe namespace
kubectl get all -n inkframe

# Restart the server (e.g. after updating a secret)
kubectl rollout restart deployment/server -n inkframe

# Deploy a new server image
kubectl set image deployment/server \
  server=123456789.dkr.ecr.us-east-1.amazonaws.com/inkframe/server:v1.2.3 \
  -n inkframe

# Scale the server manually
kubectl scale deployment/server --replicas=4 -n inkframe

# Open a shell inside a running server pod
kubectl exec -it -n inkframe \
  $(kubectl get pod -n inkframe -l app=server -o jsonpath='{.items[0].metadata.name}') \
  -- sh

# View live resource usage
kubectl top pods -n inkframe
kubectl top nodes

# Re-run database migrations
kubectl delete job prisma-migrate -n inkframe --ignore-not-found
kubectl apply -f terraform/k8s/db-migration-job.yaml
```

---

## Tearing Everything Down

> **Warning:** This permanently deletes your database, Redis data, and all AWS
> resources. Only do this if you are sure.

```bash
# First remove the Kubernetes resources (they provision AWS load balancers
# that Terraform does not directly manage and must be gone first)
kubectl delete -f terraform/k8s/

# Then destroy all Terraform-managed AWS resources
cd terraform
terraform destroy
```

If `terraform destroy` fails on the RDS instance, it is because
`db_deletion_protection = true`. Disable it first:

```bash
# In terraform.tfvars, set:
#   db_deletion_protection = false
terraform apply   # updates only the RDS setting
terraform destroy # now succeeds
```

---

## Troubleshooting

### Pods stuck in `Pending`

```bash
kubectl describe pod <pod-name> -n inkframe
```
Look at the `Events` section at the bottom. Common causes:
- **Insufficient CPU/memory** — the cluster autoscaler should add nodes within
  ~2 minutes. If it doesn't, check autoscaler logs:
  `kubectl logs -n kube-system -l app.kubernetes.io/name=cluster-autoscaler`
- **Image pull error** — the ECR URL in the deployment YAML is wrong, or
  Docker login expired. Re-run the `aws ecr get-login-password` command.

### Pods in `CrashLoopBackOff`

```bash
kubectl logs -n inkframe <pod-name> --previous
```
The `--previous` flag shows logs from the crashed container. Common causes:
- Missing environment variable or secret
- Database connection refused (check the secret ARN and ExternalSecret status)
- App code error on startup

### ExternalSecret not syncing

```bash
kubectl describe externalsecret inkframe-app-secrets -n inkframe
```
Look for errors. The most common issue is that the External Secrets Operator
does not have permission to read from Secrets Manager. Check the IRSA
annotation on the `external-secrets` service account.

### `terraform apply` fails mid-way

Terraform is idempotent — just run `terraform apply` again. It will pick up
where it left off and only create what is missing.

---

## Cost Estimate (us-east-1, as of 2026)

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

To reduce costs during development, switch to single-AZ (`db_multi_az = false`,
`redis_num_cache_nodes = 1`, and use 1 NAT Gateway by reducing to 1 AZ).

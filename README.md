# Inkframe

> AI-powered eBook authoring and publishing platform. Write, edit, and export books in ePub, print-ready PDF, and MP3 audiobook formats — ready for KDP, Apple Books, ACX, and more.

---

## What is Inkframe?

Inkframe is a full-stack MERN application that helps writers research, outline, write, edit, and export books across multiple formats:

- **ePub** — for Kindle/KDP, Apple Books, Kobo
- **PDF Digital** — screen-optimised A4 for digital distribution
- **PDF Print** — 6×9 inch KDP print-on-demand with correct margins
- **MP3 Audiobook** — AI-generated narration via ElevenLabs, for ACX and Findaway

The platform includes an AI co-writer (Claude) that streams writing suggestions in real time, a KDP metadata generator, and a publishing readiness checklist.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER BROWSER                                │
│  Next.js 16 App Router (TypeScript)                                 │
│  Pages: Dashboard → Editor → Export → Publish                       │
└───────────────────────────┬─────────────────────────────────────────┘
                            │ HTTPS
┌───────────────────────────▼─────────────────────────────────────────┐
│                       EXPRESS API SERVER                            │
│  /api/books     — CRUD for books                                    │
│  /api/chapters  — CRUD for chapters                                 │
│  /api/ai        — Claude co-writer (streaming SSE)                  │
│  /api/export    — trigger export jobs (epub/pdf)                    │
│  /api/audio     — trigger audio generation jobs                     │
│  /api/publish   — KDP metadata + readiness checklist                │
│  /api/files     — signed S3 download URLs                           │
└────────────┬────────────────────────────┬───────────────────────────┘
             │                            │
┌────────────▼────────────┐  ┌────────────▼───────────────────────────┐
│   PostgreSQL (AWS RDS)  │  │  Redis (AWS ElastiCache)               │
│   Managed by Prisma ORM │  │  BullMQ job queues:                    │
│                         │  │   - export-epub                        │
│   Tables:               │  │   - export-pdf                         │
│   - users               │  │   - generate-audio                     │
│   - books               │  └────────────┬───────────────────────────┘
│   - book_chapters       │               │
│   - exports             │  ┌────────────▼───────────────────────────┐
│   - audio_files         │  │  BullMQ Workers                        │
└─────────────────────────┘  │  epubWorker  → S3                      │
                             │  pdfWorker   → S3                      │
┌────────────────────────┐   │  audioWorker → S3                      │
│    AWS S3 Bucket       │◄──┘                                        │
│  /exports/             │   └────────────────────────────────────────┘
│  /audio/               │
└────────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS v4 |
| State | TanStack Query v5 (server state), Zustand v5 (auth) |
| Backend | Express 5, TypeScript, Node.js |
| ORM | Prisma 5 (PostgreSQL) |
| Job Queue | BullMQ + Redis (ioredis) |
| Auth | JWT (jsonwebtoken + bcryptjs) |
| AI | Anthropic Claude (claude-opus-4-5), streaming SSE |
| TTS | ElevenLabs API |
| Storage | AWS S3 + pre-signed URLs |
| Export | epub-gen-memory (ePub), Puppeteer (PDF) |
| Monitoring | Prometheus + Grafana + Alertmanager |
| Infrastructure | Terraform → AWS EKS, RDS, ElastiCache, ECR, ALB |
| CI/CD | GitHub Actions + ArgoCD (GitOps) |
| Secrets | AWS Secrets Manager + External Secrets Operator |

---

## Getting Started

### Prerequisites

- Node.js 20+
- Docker + Docker Compose
- PostgreSQL (or use Docker)
- Redis (or use Docker)

### 1. Clone and install

```bash
git clone https://github.com/your-org/inkframe-mern.git
cd inkframe-mern

# Install server dependencies
cd server && npm install

# Install client dependencies
cd ../client && npm install
```

### 2. Environment variables

**`server/.env`**
```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/inkframe
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-super-secret-jwt-key

# AI
ANTHROPIC_API_KEY=sk-ant-...
ELEVENLABS_API_KEY=...

# AWS
AWS_REGION=us-east-1
S3_BUCKET_NAME=inkframe-exports

# Server
PORT=4000
CLIENT_URL=http://localhost:3000
NODE_ENV=development
```

**`client/.env.local`**
```bash
NEXT_PUBLIC_API_URL=http://localhost:4000
```

### 3. Database setup

```bash
cd server
npx prisma migrate dev --name init
npx prisma generate
```

### 4. Start local development

Using Docker Compose (recommended):
```bash
# From the project root
docker-compose up -d
```

Or manually:
```bash
# Terminal 1 — API server
cd server && npm run dev

# Terminal 2 — Next.js frontend
cd client && npm run dev
```

The app will be available at:
- Frontend: http://localhost:3000
- API: http://localhost:4000
- API Health: http://localhost:4000/health

---

## Application Features

### Dashboard
- Grid view of all your books with word count progress bars
- Create new books with title, subtitle, genre, and word count goal
- Click any book to open the editor

### Editor (`/editor/[bookId]`)
Three-column layout:

```
┌──────────────┬───────────────────────────┬──────────────┐
│  Chapter     │       Content Editor       │  AI Panel    │
│  List        │                            │              │
│              │  Chapter title (editable)  │  [Outline]   │
│  Ch 1 ✓     │                            │  [Continue]  │
│  Ch 2 ✓     │  Text content area         │  [Rewrite]   │
│  Ch 3 ◌     │  (autosave every 30s)      │  [Summarize] │
│              │                            │              │
│  + Add Ch    │  Word count display        │  AI output   │
│              │                            │  streams     │
└──────────────┴───────────────────────────┴──────────────┘
```

- **Chapter List** — click to switch chapters, delete with confirmation
- **Editor** — autosaves every 30 seconds, manual Save button
- **AI Panel** — four modes, all streaming via Server-Sent Events:
  - **Outline** — generate a complete 8–12 chapter outline
  - **Continue** — write the next 3–5 paragraphs in your voice
  - **Rewrite** — improve clarity and flow of current content
  - **Summarize** — summarise the current chapter
  - **Insert** button — paste AI output into the editor

### Export (`/export/[bookId]`)
- **ePub** — for KDP, Apple Books, Kobo
- **PDF Digital** — A4, screen-optimised
- **PDF Print** — 6×9 inch, KDP print-on-demand margins
- **Audiobook** — MP3 via ElevenLabs TTS
- Export history table with status polling and download links

### Publish (`/publish/[bookId]`)
- **KDP Metadata Generator** — Claude generates an Amazon-optimised description (HTML), 7 keyword phrases, and 2 BISAC categories with copy buttons
- **Publishing Checklist** — automatically checks: title set, description ≥100 chars, ≥5 chapters, ≥10k words, ePub exported
- **Platform Links** — direct links to KDP, IngramSpark, ACX, Findaway, Apple Books

---

## API Reference

### Auth
| Method | Path | Description |
|---|---|---|
| `POST` | `/api/auth/signup` | Register with email + password |
| `POST` | `/api/auth/login` | Login, returns JWT |
| `GET` | `/api/auth/me` | Get current user |

### Books
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/books` | List all books |
| `POST` | `/api/books` | Create a book |
| `GET` | `/api/books/:id` | Get book with chapters + exports |
| `PATCH` | `/api/books/:id` | Update book metadata |
| `DELETE` | `/api/books/:id` | Delete book |

### Chapters
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/books/:bookId/chapters` | List chapters |
| `POST` | `/api/books/:bookId/chapters` | Create chapter |
| `GET` | `/api/books/:bookId/chapters/:id` | Get chapter |
| `PATCH` | `/api/books/:bookId/chapters/:id` | Update / autosave |
| `DELETE` | `/api/books/:bookId/chapters/:id` | Delete chapter |
| `PATCH` | `/api/books/:bookId/chapters/reorder` | Reorder chapters |

### AI (all SSE streaming)
| Method | Path | Description |
|---|---|---|
| `POST` | `/api/ai/outline` | Generate book outline |
| `POST` | `/api/ai/continue` | Continue writing |
| `POST` | `/api/ai/rewrite` | Rewrite selected text |
| `POST` | `/api/ai/summarize` | Summarize chapter |
| `POST` | `/api/ai/suggest-title` | Suggest book titles |

### Export
| Method | Path | Description |
|---|---|---|
| `POST` | `/api/export` | Trigger export job |
| `GET` | `/api/export/:bookId` | List exports for a book |
| `GET` | `/api/export/:id/download` | Get pre-signed S3 URL |

### Audio
| Method | Path | Description |
|---|---|---|
| `POST` | `/api/audio` | Trigger audio generation |
| `GET` | `/api/audio/:bookId` | List audio files |
| `GET` | `/api/audio/:id/download` | Get pre-signed S3 URL |

### Publish
| Method | Path | Description |
|---|---|---|
| `POST` | `/api/publish/metadata` | Generate KDP metadata |
| `POST` | `/api/publish/checklist` | Get publishing checklist |

---

## Database Schema

Core models (managed by Prisma):

| Model | Purpose |
|---|---|
| `User` | Authentication, plan, Stripe billing |
| `Book` | Book project with metadata and status |
| `BookChapter` | Individual chapters with content and word count |
| `Export` | Export job records (ePub, PDF, DOCX) |
| `AudioFile` | Audio generation job records |

---

## DevOps & Infrastructure

The full DevOps pipeline is production-grade and already deployed. See [DEVOPS.md](./DEVOPS.md) for details.

| Layer | Technology | Status |
|---|---|---|
| Infrastructure | Terraform → AWS (VPC, EKS, RDS, ElastiCache, ECR, ALB) | ✅ |
| Containers | Docker + docker-compose | ✅ |
| CI Pipeline | GitHub Actions — lint, typecheck, docker build | ✅ |
| CD Pipeline | GitHub Actions — build, Trivy scan, migrate, deploy | ✅ |
| GitOps | ArgoCD + Kustomize | ✅ |
| Kubernetes | EKS with HPA, health probes, rolling updates | ✅ |
| Secrets | External Secrets Operator → AWS Secrets Manager | ✅ |
| Monitoring | Prometheus + Grafana + Alertmanager | ✅ |

### Monitoring

- **Health check**: `GET /health` — used by K8s liveness/readiness probes
- **Metrics**: `GET /metrics` — Prometheus scrape endpoint (not public)
- **Grafana**: pre-built dashboards for HTTP latency, error rates, queue depth

---

## Project Structure

```
inkframe-mern/
├── server/                     # Express API
│   ├── prisma/
│   │   └── schema.prisma       # Database schema
│   └── src/
│       ├── routes/             # API route handlers
│       │   ├── books.ts
│       │   ├── chapters.ts
│       │   ├── ai.ts
│       │   ├── export.ts
│       │   ├── audio.ts
│       │   ├── publish.ts
│       │   └── files.ts
│       ├── lib/                # Shared utilities
│       │   ├── claude.ts       # Anthropic Claude API wrapper
│       │   ├── epub.ts         # ePub generation
│       │   ├── pdf.ts          # PDF generation (Puppeteer)
│       │   ├── s3.ts           # AWS S3 upload + presigned URLs
│       │   ├── tts.ts          # ElevenLabs TTS
│       │   └── htmlUtils.ts    # Strip HTML, count words
│       ├── jobs/
│       │   ├── queue.ts        # BullMQ queue definitions
│       │   └── workers/
│       │       ├── epubWorker.ts
│       │       ├── pdfWorker.ts
│       │       └── audioWorker.ts
│       ├── middleware/
│       │   ├── auth.ts         # JWT requireAuth middleware
│       │   └── errorHandler.ts
│       └── index.ts            # Express app entry point
├── client/                     # Next.js frontend
│   └── src/
│       ├── app/
│       │   ├── dashboard/      # Book list
│       │   ├── editor/[bookId] # Writing editor
│       │   ├── export/[bookId] # Export center
│       │   └── publish/[bookId]# Publish assistant
│       ├── components/
│       │   ├── BookCard.tsx
│       │   ├── BookModal.tsx
│       │   ├── ExportCard.tsx
│       │   ├── ExportHistory.tsx
│       │   ├── PublishChecklist.tsx
│       │   ├── StatusBadge.tsx
│       │   └── Editor/
│       │       └── WordCounter.tsx
│       └── lib/
│           ├── api.ts          # Axios instance with auth
│           └── stores/
│               └── authStore.ts
├── k8s/                        # Kubernetes manifests
├── argocd/                     # ArgoCD GitOps config
├── terraform/                  # AWS infrastructure
├── .github/workflows/          # CI/CD pipelines
├── docker-compose.yml          # Local dev environment
└── DEVOPS.md                   # DevOps documentation
```

---

## License

MIT

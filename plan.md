# Inkframe — Full Project Plan

> **What is Inkframe?**
> Inkframe is an AI-powered eBook authoring and publishing platform. It helps writers
> research, outline, write, edit, and export books across multiple formats — ePub for
> Kindle/KDP, print-ready PDF for print-on-demand, and MP3/M4B for audiobook platforms
> like ACX and Findaway. The entire DevOps pipeline (CI/CD, Kubernetes, monitoring,
> Terraform) is already production-grade. This document defines what needs to be built
> at the application layer to make Inkframe a fully working product.

---

## Table of Contents

1. [Current State](#1-current-state)
2. [Target Architecture](#2-target-architecture)
3. [Database Schema](#3-database-schema)
4. [Backend — API Routes](#4-backend--api-routes)
5. [Backend — BullMQ Jobs](#5-backend--bullmq-jobs)
6. [Frontend — Pages & Components](#6-frontend--pages--components)
7. [AI Integration](#7-ai-integration)
8. [Export Pipeline](#8-export-pipeline)
9. [Audio Pipeline](#9-audio-pipeline)
10. [Publishing Assistant](#10-publishing-assistant)
11. [Feature Roadmap](#11-feature-roadmap)
12. [Build Order](#12-build-order)
13. [Environment Variables](#13-environment-variables)
14. [NPM Packages to Add](#14-npm-packages-to-add)

---

## 1. Current State

### What's Already Built (DevOps Layer — Production Grade ✅)

The full DevOps infrastructure is complete and production-ready. Do not rebuild any of this.

| Layer | Technology | Status |
|---|---|---|
| Infrastructure | Terraform → AWS (VPC, EKS, RDS, ElastiCache, ECR, ALB) | ✅ Done |
| Containers | Docker + docker-compose (local dev) | ✅ Done |
| CI Pipeline | GitHub Actions — lint, typecheck, docker build | ✅ Done |
| CD Pipeline | GitHub Actions — build, Trivy scan, migrate, deploy | ✅ Done |
| GitOps | ArgoCD + Kustomize | ✅ Done |
| Kubernetes | EKS — deployments, HPA, health probes, rolling updates | ✅ Done |
| Secrets | External Secrets Operator → AWS Secrets Manager | ✅ Done |
| Monitoring | Prometheus + Grafana + Alertmanager + prom-client | ✅ Done |
| Auth | OIDC between GitHub Actions and AWS | ✅ Done |

### What's Missing (Application Layer — To Be Built)

| Layer | Status |
|---|---|
| Database schema (Prisma models) | ❌ Not started |
| REST API routes (books, chapters, export, AI) | ❌ Not started |
| BullMQ job workers (epub, pdf, audio) | ❌ Not started |
| Frontend pages (dashboard, editor, export) | ❌ Not started |
| AI co-writer (Claude API integration) | ❌ Not started |
| Export pipeline (ePub, PDF, audio) | ❌ Not started |
| KDP metadata generator | ❌ Not started |

---

## 2. Target Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER BROWSER                                │
│  Next.js 14 App Router (TypeScript)                                 │
│  Pages: Dashboard → Editor → Export → Publish                       │
│  Components: BookList, ChapterList, TipTap Editor, AIPanel          │
└───────────────────────────┬─────────────────────────────────────────┘
                            │ HTTPS
┌───────────────────────────▼─────────────────────────────────────────┐
│                       EXPRESS API SERVER                            │
│  /api/books     — CRUD for books                                    │
│  /api/chapters  — CRUD for chapters                                 │
│  /api/ai        — Claude co-writer (stream)                         │
│  /api/export    — trigger export jobs                               │
│  /api/audio     — trigger audio generation jobs                     │
│  /api/publish   — KDP metadata generator                            │
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
│   - chapters            │               │
│   - exports             │  ┌────────────▼───────────────────────────┐
│   - audio_files         │  │  BullMQ Workers (same server process)  │
└─────────────────────────┘  │  epubWorker.ts                         │
                             │  pdfWorker.ts                          │
┌────────────────────────┐   │  audioWorker.ts                        │
│    AWS S3 Bucket       │◄──┤  → write output to S3                  │
│  /exports/             │   │  → update exports table in Postgres     │
│  /audio/               │   └────────────────────────────────────────┘
└────────────────────────┘
```

### External APIs Used

| API | Purpose | Cost Model |
|---|---|---|
| Anthropic Claude API | AI co-writer, outline generator, metadata | Per token |
| ElevenLabs API | Text-to-speech for audiobooks | Per character |
| AWS S3 | Store generated ePub, PDF, MP3 files | Per GB |

---

## 3. Database Schema

Add these models to `server/prisma/schema.prisma`.

```prisma
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  books     Book[]
}

model Book {
  id          String    @id @default(cuid())
  userId      String
  user        User      @relation(fields: [userId], references: [id])
  title       String
  subtitle    String?
  description String?   // used for KDP blurb
  genre       String?   // self-help, fiction, how-to, children, etc.
  targetWords Int?      // writing goal (e.g. 50000)
  status      BookStatus @default(DRAFT)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  chapters    Chapter[]
  exports     Export[]
  audioFiles  AudioFile[]
}

enum BookStatus {
  DRAFT
  WRITING
  EDITING
  READY
  PUBLISHED
}

model Chapter {
  id        String   @id @default(cuid())
  bookId    String
  book      Book     @relation(fields: [bookId], references: [id], onDelete: Cascade)
  title     String
  content   String   @db.Text  // stores rich text as HTML (from TipTap)
  order     Int      // for drag-and-drop reordering
  wordCount Int      @default(0)
  status    ChapterStatus @default(DRAFT)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

enum ChapterStatus {
  DRAFT
  WRITING
  COMPLETE
}

model Export {
  id        String       @id @default(cuid())
  bookId    String
  book      Book         @relation(fields: [bookId], references: [id])
  format    ExportFormat
  status    JobStatus    @default(PENDING)
  s3Key     String?      // e.g. exports/book-id/book-title.epub
  s3Url     String?      // pre-signed download URL
  errorMsg  String?
  createdAt DateTime     @default(now())
  updatedAt DateTime     @updatedAt
}

enum ExportFormat {
  EPUB
  PDF_DIGITAL   // KDP digital
  PDF_PRINT     // KDP print-on-demand (with bleed/margins)
  DOCX
}

enum JobStatus {
  PENDING
  PROCESSING
  DONE
  FAILED
}

model AudioFile {
  id        String    @id @default(cuid())
  bookId    String
  book      Book      @relation(fields: [bookId], references: [id])
  chapterId String?   // null = full book audio
  voice     String    @default("rachel")  // ElevenLabs voice ID
  status    JobStatus @default(PENDING)
  s3Key     String?
  s3Url     String?
  errorMsg  String?
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
}
```

After adding models, run:
```bash
npx prisma migrate dev --name add-book-chapter-export-models
npx prisma generate
```

---

## 4. Backend — API Routes

All routes live in `server/src/routes/`. Register them in `server/src/index.ts`.

### 4.1 Books — `routes/books.ts`

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/books` | List all books for the logged-in user |
| `POST` | `/api/books` | Create a new book |
| `GET` | `/api/books/:id` | Get one book with its chapters |
| `PATCH` | `/api/books/:id` | Update book metadata (title, description, etc.) |
| `DELETE` | `/api/books/:id` | Delete book and all its chapters |

### 4.2 Chapters — `routes/chapters.ts`

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/books/:bookId/chapters` | List chapters for a book |
| `POST` | `/api/books/:bookId/chapters` | Create a new chapter |
| `GET` | `/api/books/:bookId/chapters/:id` | Get one chapter with full content |
| `PATCH` | `/api/books/:bookId/chapters/:id` | Save chapter content (autosave) |
| `DELETE` | `/api/books/:bookId/chapters/:id` | Delete a chapter |
| `PATCH` | `/api/books/:bookId/chapters/reorder` | Update chapter order after drag-and-drop |

### 4.3 AI Co-Writer — `routes/ai.ts`

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/ai/outline` | Generate book outline from title + genre |
| `POST` | `/api/ai/continue` | Continue writing from the current cursor position |
| `POST` | `/api/ai/rewrite` | Rewrite selected text in a different style/tone |
| `POST` | `/api/ai/summarize` | Summarize a chapter |
| `POST` | `/api/ai/suggest-title` | Suggest book titles from description |

All AI routes stream responses using `res.setHeader('Content-Type', 'text/event-stream')`.

### 4.4 Export — `routes/export.ts`

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/export` | Enqueue an export job (epub, pdf, docx) |
| `GET` | `/api/export/:bookId` | List all exports for a book |
| `GET` | `/api/export/:id/download` | Get a pre-signed S3 URL for download |

### 4.5 Audio — `routes/audio.ts`

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/audio` | Enqueue audio generation job |
| `GET` | `/api/audio/:bookId` | List all audio files for a book |
| `GET` | `/api/audio/:id/download` | Get a pre-signed S3 download URL |

### 4.6 Publishing Assistant — `routes/publish.ts`

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/publish/metadata` | Generate KDP blurb + keywords + categories |
| `POST` | `/api/publish/checklist` | Return publishing readiness checklist for a book |

### 4.7 Files — `routes/files.ts`

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/files/signed-url` | Generate a pre-signed S3 URL for any stored file |

---

## 5. Backend — BullMQ Jobs

BullMQ and Redis are already wired up. Add these workers in `server/src/jobs/`.

### 5.1 ePub Worker — `jobs/epubWorker.ts`

**Queue name:** `export-epub`

**Job payload:**
```typescript
{ bookId: string; exportId: string; userId: string }
```

**Steps:**
1. Fetch book + all chapters from Postgres (ordered by `chapter.order`)
2. Strip HTML tags from chapter content to get plain text
3. Use `epub-gen` to build the `.epub` file in `/tmp`
4. Upload to S3 at `exports/{bookId}/{title}.epub`
5. Update `Export` record: `status = DONE`, set `s3Key` and `s3Url`
6. On error: update `Export` record: `status = FAILED`, set `errorMsg`

### 5.2 PDF Worker — `jobs/pdfWorker.ts`

**Queue name:** `export-pdf`

**Job payload:**
```typescript
{ bookId: string; exportId: string; pdfType: 'digital' | 'print' }
```

**Steps:**
1. Fetch book + chapters
2. Build HTML document from chapters (apply CSS for KDP formatting)
   - Digital: standard margins, screen-optimised font size
   - Print: 6x9 inch trim size, 0.125in bleed, mirrored margins
3. Use Puppeteer to render HTML → PDF in `/tmp`
4. Upload to S3 at `exports/{bookId}/{title}-print.pdf`
5. Update `Export` record in Postgres

### 5.3 Audio Worker — `jobs/audioWorker.ts`

**Queue name:** `generate-audio`

**Job payload:**
```typescript
{ bookId: string; audioFileId: string; chapterId?: string; voice: string }
```

**Steps:**
1. Fetch chapters (or single chapter if `chapterId` provided)
2. Strip HTML to get plain text
3. Call ElevenLabs TTS API for each chapter (in sequence, not parallel — rate limit)
4. Stitch MP3 chunks using `fluent-ffmpeg`
5. Upload final `.mp3` to S3 at `audio/{bookId}/{title}.mp3`
6. Update `AudioFile` record in Postgres

---

## 6. Frontend — Pages & Components

All pages live in `client/src/app/`. All components in `client/src/components/`.

### 6.1 Pages

```
client/src/app/
├── page.tsx                        ← Landing page (marketing)
├── dashboard/
│   └── page.tsx                    ← Book project list
├── editor/
│   └── [bookId]/
│       └── page.tsx                ← Main writing editor
├── export/
│   └── [bookId]/
│       └── page.tsx                ← Export + download center
└── publish/
    └── [bookId]/
        └── page.tsx                ← KDP metadata + publish checklist
```

### 6.2 Dashboard Page (`/dashboard`)

Shows a grid of all books with:
- Book title, genre, status badge, word count / target word count progress bar
- "New Book" button → opens a modal to set title + genre
- Click on a book → goes to the editor

### 6.3 Editor Page (`/editor/[bookId]`)

This is the core page. Three-column layout:

```
┌──────────────┬───────────────────────────────┬──────────────┐
│  Chapter     │         TipTap Editor          │  AI Panel    │
│  List        │                                │              │
│              │  Chapter title (editable)       │  [Outline]   │
│  Ch 1 ✓     │                                │  [Continue]  │
│  Ch 2 ✓     │  Rich text content area        │  [Rewrite]   │
│  Ch 3 ◌     │  (autosave every 30 seconds)   │  [Summarize] │
│              │                                │              │
│  + Add Ch    │  Word count: 2,341 / 5,000     │  AI output   │
│              │                                │  streams     │
└──────────────┴───────────────────────────────┴──────────────┘
```

**Chapter List features:**
- Drag to reorder chapters (using `@dnd-kit/core`)
- Click to open a chapter in the editor
- Status indicator (Draft / Writing / Complete)
- Delete chapter (with confirmation)

**TipTap Editor features:**
- Rich text: bold, italic, headings (H1-H3), lists, blockquotes
- Autosave every 30 seconds via `PATCH /api/books/:id/chapters/:chapterId`
- Unsaved changes indicator
- Word count per chapter and book total

**AI Panel features:**
- Tabs: Outline / Continue / Rewrite / Summarize
- Streams Claude API response in real time (Server-Sent Events)
- "Insert" button to paste AI output into editor at cursor position

### 6.4 Export Page (`/export/[bookId]`)

Format selection grid:

```
┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│   📱 ePub   │  │ 💻 PDF      │  │ 🖨️ PDF      │  │ 🎧 Audio    │
│             │  │  Digital    │  │   Print     │  │             │
│  KDP, Apple │  │  Screen     │  │  KDP POD    │  │  ACX, Spotify│
│  Books,     │  │  optimised  │  │  IngramSpark│  │  Findaway   │
│  Kobo       │  │             │  │  6×9 trim   │  │             │
│             │  │             │  │             │  │             │
│  [Export]   │  │  [Export]   │  │  [Export]   │  │  [Generate] │
└─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘
```

Below the grid: a table of past exports with status indicators and download links.

**Status polling:** After triggering a job, the page polls `GET /api/export/:bookId`
every 5 seconds until status changes from PENDING/PROCESSING to DONE or FAILED.

### 6.5 Publish Page (`/publish/[bookId]`)

Three sections:

**Section 1 — KDP Metadata Generator**
- Input: book title, genre, short synopsis (user writes a few sentences)
- Output (generated by Claude):
  - Amazon-optimised book description (HTML formatted, up to 4000 chars)
  - 7 keyword phrases (for KDP backend keywords field)
  - 2 recommended BISAC categories with justification
- Copy buttons for each field

**Section 2 — Publishing Checklist**
- Auto-checks each item against the book's data in Postgres
- Items: cover image uploaded, minimum word count met, ePub exported, print PDF exported,
  metadata fields filled in, description generated

**Section 3 — Platform Links**
- Direct links to KDP, IngramSpark, ACX, Findaway, Apple Books for Creators

### 6.6 Shared Components

```
client/src/components/
├── BookCard.tsx            ← Used in dashboard
├── BookModal.tsx           ← Create/edit book metadata
├── ChapterList.tsx         ← Drag-and-drop list
├── ChapterItem.tsx         ← Single chapter row
├── Editor/
│   ├── TipTapEditor.tsx    ← Rich text editor wrapper
│   ├── Toolbar.tsx         ← Bold, italic, heading buttons
│   └── WordCounter.tsx     ← Word count display
├── AIPanel/
│   ├── AIPanel.tsx         ← Right panel container
│   ├── AITab.tsx           ← Tab switcher
│   └── AIStream.tsx        ← Renders streaming Claude output
├── ExportCard.tsx          ← Format option card
├── ExportHistory.tsx       ← Table of past exports
├── PublishChecklist.tsx    ← Readiness checklist
└── StatusBadge.tsx         ← Coloured status pill
```

---

## 7. AI Integration

### 7.1 Claude API Wrapper — `server/src/lib/claude.ts`

```typescript
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function streamCompletion(
  systemPrompt: string,
  userPrompt: string,
  res: Response  // Express response object
): Promise<void> {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const stream = await anthropic.messages.stream({
    model: 'claude-opus-4-5',
    max_tokens: 2048,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  for await (const chunk of stream) {
    if (chunk.type === 'content_block_delta') {
      res.write(`data: ${JSON.stringify({ text: chunk.delta.text })}\n\n`);
    }
  }

  res.write('data: [DONE]\n\n');
  res.end();
}
```

### 7.2 System Prompts

**Outline Generator:**
```
You are an expert book planner. Given a title and genre, generate a complete
book outline with 8-12 chapters. For each chapter provide: a title, a 2-sentence
summary of what happens, and 3 key points to cover. Format as structured JSON.
```

**AI Co-Writer (Continue):**
```
You are a skilled ghostwriter helping the user continue their book chapter.
Match the existing writing style exactly — same tone, sentence length, vocabulary level,
and narrative voice. Write the next 3-5 paragraphs that flow naturally from where
the text ends. Do not summarise or change what came before.
```

**AI Co-Writer (Rewrite):**
```
You are an expert editor. Rewrite the provided text to improve clarity, flow,
and impact while preserving the original meaning and the author's unique voice.
```

**KDP Metadata Generator:**
```
You are an Amazon KDP publishing expert. Generate optimised book metadata that
will maximise discoverability on Amazon. Follow Amazon's content guidelines.
Return JSON with: description (HTML formatted), keywords (array of 7 phrases),
categories (array of 2 BISAC codes with names and justification).
```

---

## 8. Export Pipeline

### 8.1 ePub Generation — `server/src/lib/epub.ts`

**Package:** `epub-gen` (or `epub-gen-memory` for buffer output)

**Install:**
```bash
npm install epub-gen-memory
```

**Implementation:**
```typescript
import EPub from 'epub-gen-memory';

export async function generateEpub(book: BookWithChapters): Promise<Buffer> {
  const options = {
    title: book.title,
    author: book.user.name ?? 'Unknown Author',
    publisher: 'Inkframe',
    description: book.description ?? '',
    content: book.chapters
      .sort((a, b) => a.order - b.order)
      .map(chapter => ({
        title: chapter.title,
        data: chapter.content,  // TipTap outputs HTML — epub-gen accepts HTML
      })),
  };

  return await EPub(options);
}
```

### 8.2 PDF Generation — `server/src/lib/pdf.ts`

**Package:** `puppeteer`

**Install:**
```bash
npm install puppeteer
```

**Implementation:** Build an HTML template with chapter content, then use Puppeteer
to render it to PDF with appropriate page size and margins.

```typescript
import puppeteer from 'puppeteer';

export async function generatePdf(
  book: BookWithChapters,
  type: 'digital' | 'print'
): Promise<Buffer> {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setContent(buildHtmlTemplate(book, type));

  const pdfBuffer = await page.pdf({
    format: type === 'print' ? undefined : 'A4',
    width:  type === 'print' ? '6in'  : undefined,
    height: type === 'print' ? '9in'  : undefined,
    margin: type === 'print'
      ? { top: '1in', bottom: '1in', left: '0.875in', right: '0.625in' }
      : { top: '1in', bottom: '1in', left: '1in', right: '1in' },
    printBackground: true,
  });

  await browser.close();
  return pdfBuffer;
}
```

> **KDP Print specs:** 6×9 inch trim, mirrored margins (inside 0.875in, outside 0.625in),
> no bleed for text-only books.

### 8.3 S3 Upload — `server/src/lib/s3.ts`

**Package:** `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`

```typescript
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3 = new S3Client({ region: process.env.AWS_REGION });
const BUCKET = process.env.S3_BUCKET_NAME!;

export async function uploadToS3(key: string, buffer: Buffer, contentType: string) {
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }));
}

export async function getPresignedUrl(key: string, expiresIn = 3600): Promise<string> {
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(s3, command, { expiresIn });
}
```

---

## 9. Audio Pipeline

### 9.1 ElevenLabs Integration — `server/src/lib/tts.ts`

**Package:** `elevenlabs` (official SDK)

**Install:**
```bash
npm install elevenlabs
```

**Implementation:**
```typescript
import { ElevenLabsClient } from 'elevenlabs';
import { Readable } from 'stream';

const eleven = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY });

export async function textToSpeech(text: string, voiceId: string): Promise<Buffer> {
  const chunks: Buffer[] = [];

  const audioStream = await eleven.generate({
    voice: voiceId,
    text,
    model_id: 'eleven_multilingual_v2',
  });

  for await (const chunk of audioStream) {
    chunks.push(Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}
```

### 9.2 Recommended Voice IDs

| Voice | Style | Best For |
|---|---|---|
| `21m00Tcm4TlvDq8ikWAM` | Rachel — warm, narration | Non-fiction, self-help |
| `AZnzlk1XvdvUeBnXmlld` | Domi — confident, clear | Business, how-to |
| `EXAVITQu4vr4xnSDxMaL` | Bella — soft, expressive | Fiction, personal stories |
| `ErXwobaYiN019PkySvjV` | Antoni — deep, authoritative | Thriller, drama |

---

## 10. Publishing Assistant

### 10.1 KDP Metadata Fields

When the user clicks "Generate Metadata" on the Publish page, call `POST /api/publish/metadata`
with the book's title, genre, and a short synopsis. Claude returns:

```json
{
  "description": "<p>Are you struggling to...</p><p>In this book, you'll discover...</p>",
  "keywords": [
    "productivity habits for entrepreneurs",
    "morning routine self improvement",
    "time management techniques",
    "how to be more productive",
    "focus and deep work strategies",
    "build better habits book",
    "personal development for beginners"
  ],
  "categories": [
    {
      "bisac": "SEL031000",
      "name": "Self-Help / Personal Growth / Success",
      "reason": "Primary category — directly matches the book's core topic"
    },
    {
      "bisac": "BUS097000",
      "name": "Business & Economics / Time Management",
      "reason": "Secondary category — captures business audience searching for productivity"
    }
  ]
}
```

### 10.2 Publishing Readiness Checklist

Automatically computed from the book's data. Check all of the following:

| Item | How to Check |
|---|---|
| Book title set | `book.title !== null && book.title.length > 0` |
| Book description written | `book.description && book.description.length >= 100` |
| At least 5 chapters | `book.chapters.length >= 5` |
| Minimum 10,000 words | `sum of chapter.wordCount >= 10000` |
| ePub exported successfully | `book.exports.some(e => e.format === 'EPUB' && e.status === 'DONE')` |
| KDP metadata generated | `book.description includes generated content` (flag on book model) |

---

## 11. Feature Roadmap

### Phase 1 — Core Writing (Build First)

These are the minimum features needed to call Inkframe a working app.

| Feature | Effort | Priority |
|---|---|---|
| Prisma schema + migration | 0.5 day | 🔴 P0 |
| Books CRUD API routes | 1 day | 🔴 P0 |
| Chapters CRUD API routes | 1 day | 🔴 P0 |
| Dashboard page | 1 day | 🔴 P0 |
| TipTap editor with autosave | 2 days | 🔴 P0 |
| Chapter list with drag-and-drop | 1 day | 🔴 P0 |

### Phase 2 — AI Layer

| Feature | Effort | Priority |
|---|---|---|
| Claude API wrapper + streaming | 1 day | 🟠 P1 |
| AI outline generator | 0.5 day | 🟠 P1 |
| AI continue writing | 0.5 day | 🟠 P1 |
| AI rewrite selection | 0.5 day | 🟠 P1 |
| AI panel in editor sidebar | 1 day | 🟠 P1 |

### Phase 3 — Export Pipeline

| Feature | Effort | Priority |
|---|---|---|
| S3 upload utility | 0.5 day | 🟠 P1 |
| ePub BullMQ worker | 1 day | 🟠 P1 |
| PDF BullMQ worker (digital) | 1 day | 🟠 P1 |
| PDF BullMQ worker (print) | 0.5 day | 🟠 P1 |
| Export page with status polling | 1 day | 🟠 P1 |

### Phase 4 — Audio + Publish

| Feature | Effort | Priority |
|---|---|---|
| ElevenLabs TTS integration | 1 day | 🟡 P2 |
| Audio BullMQ worker | 1 day | 🟡 P2 |
| KDP metadata generator | 1 day | 🟡 P2 |
| Publishing checklist page | 0.5 day | 🟡 P2 |

### Phase 5 — Polish (V2)

| Feature | Effort | Priority |
|---|---|---|
| Book cover AI generator (DALL-E / Ideogram) | 2 days | 🟢 P3 |
| Multi-language translation (DeepL API) | 1 day | 🟢 P3 |
| Royalty tracker (connect to KDP CSV reports) | 2 days | 🟢 P3 |
| Competitor/niche research tool | 2 days | 🟢 P3 |
| Mobile-responsive editor | 1 day | 🟢 P3 |

---

## 12. Build Order

Follow this exact sequence to avoid blocked work.

```
Week 1
  Day 1   Add Prisma models → run migration → verify schema in psql
  Day 2   Books CRUD routes + Postman test all 5 endpoints
  Day 3   Chapters CRUD routes + Postman test all 6 endpoints
  Day 4   Dashboard page (Next.js) — book list + create book modal
  Day 5   Chapter list component (no editor yet — just the list)

Week 2
  Day 1   TipTap editor (install, basic toolbar, display chapter content)
  Day 2   Autosave (debounced PATCH to chapters API)
  Day 3   Claude API wrapper + streaming SSE endpoint
  Day 4   AI outline generator (endpoint + UI)
  Day 5   AI continue + rewrite (endpoints + AI Panel component)

Week 3
  Day 1   S3 upload utility + environment setup
  Day 2   ePub BullMQ worker (full flow: fetch → generate → upload → update DB)
  Day 3   PDF BullMQ worker (digital + print)
  Day 4   Export page (trigger jobs, poll status, download links)
  Day 5   ElevenLabs integration + audio worker

Week 4
  Day 1   KDP metadata generator (API + Publish page)
  Day 2   Publishing checklist
  Day 3   End-to-end test full flow: write → export → audio → publish page
  Day 4   Bug fixes + polish
  Day 5   Update README with demo screenshots
```

---

## 13. Environment Variables

Add these to AWS Secrets Manager (already wired via External Secrets Operator).
For local dev, add them to `server/.env`.

```bash
# Database (already exists)
DATABASE_URL=postgresql://user:password@host:5432/inkframe

# Redis (already exists)
REDIS_URL=redis://localhost:6379

# AWS (already exists for ECR — add S3 bucket)
AWS_REGION=us-east-1
AWS_ACCOUNT_ID=123456789012
S3_BUCKET_NAME=inkframe-exports

# AI APIs (new)
ANTHROPIC_API_KEY=sk-ant-...
ELEVENLABS_API_KEY=...

# Auth (new — use Clerk or Supabase Auth)
CLERK_SECRET_KEY=sk_live_...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...
```

---

## 14. NPM Packages to Add

### Server (`server/`)

```bash
npm install \
  @anthropic-ai/sdk \
  elevenlabs \
  epub-gen-memory \
  puppeteer \
  @aws-sdk/client-s3 \
  @aws-sdk/s3-request-presigner \
  fluent-ffmpeg \
  strip-html
```

### Client (`client/`)

```bash
npm install \
  @tiptap/react \
  @tiptap/pm \
  @tiptap/starter-kit \
  @tiptap/extension-character-count \
  @dnd-kit/core \
  @dnd-kit/sortable \
  @dnd-kit/utilities \
  lucide-react \
  clsx
```

---

*Plan written: March 2026*
*Status: Infrastructure complete — application build starting Phase 1*

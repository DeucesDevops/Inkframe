Inkframe Web App — Implementation Plan
Stack: Express.js (Backend) + Next.js (Frontend)
Architecture Overview
inkframe/
├── server/ ← Express.js REST API
│ ├── src/
│ │ ├── routes/ ← Skill endpoints
│ │ ├── skills/ ← Skill execution logic
│ │ ├── middleware/ ← Auth, rate limiting, validation
│ │ ├── jobs/ ← Background workers
│ │ ├── db/ ← Database queries
│ │ └── lib/ ← Claude API, utilities
│ ├── prisma/ ← Schema + migrations
│ └── package.json
│
├── client/ ← Next.js Frontend
│ ├── app/ ← Pages (App Router)
│ ├── components/ ← UI components
│ ├── hooks/ ← Custom React hooks
│ ├── lib/ ← API client, utilities
│ └── package.json
│
└── docker-compose.yml ← Local dev environment
Why this split:
Express gives you full control over routing, middleware, and background jobs
Next.js handles UI, routing, and static assets cleanly
Clear separation makes it easy to scale each side independently
Both can be deployed separately (Express on Railway/Render, Next.js on Vercel)
Tech Stack
Layer Technology Purpose
Frontend Next.js 14 (App Router) + TypeScript UI, routing, SSR
Styling Tailwind CSS + shadcn/ui Components
Backend Express.js + TypeScript REST API server
Database PostgreSQL (via Supabase) Data persistence
ORM Prisma Type-safe DB queries
Auth Supabase Auth + JWT Sessions
File Storage Supabase Storage Uploaded resources
AI Anthropic Claude API Skill execution
Background Jobs BullMQ + Redis Async processing
Caching Redis (Upstash) Rate limits, caching
Payments Stripe Subscriptions
Deployment Railway (Express) + Vercel (Next.js) Hosting
Phase 0: Project Setup (Day 1–2)
0.1 Initialize Monorepo
mkdir inkframe && cd inkframe
mkdir server client
# Server setup
cd server
npm init -y
npm install express typescript ts-node @types/express @types/node
npm install prisma @prisma/client
npm install @anthropic-ai/sdk
npm install bullmq ioredis
npm install cors helmet express-rate-limit
npm install jsonwebtoken bcryptjs
npm install multer # file uploads
npm install stripe
npm install zod npx tsc --init
npx prisma init
# request validation
# Client setup
cd ../client
npx create-next-app@latest . --typescript --tailwind --app
npm install axios
npm install @tanstack/react-query
npm install zustand # client state
0.2 Express Server Entry Point
// server/src/index.ts
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { authRouter } from './routes/auth'
import { projectRouter } from './routes/projects'
import { skillRouter } from './routes/skills'
import { webhookRouter } from './routes/webhooks'
import { errorHandler } from './middleware/errorHandler'
const app = express()
app.use(helmet())
app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }))
app.use(express.json({ limit: '10mb' }))
// Routes
app.use('/api/auth', authRouter)
app.use('/api/projects', projectRouter)
app.use('/api/skills', skillRouter)
app.use('/api/webhooks', webhookRouter) // Stripe webhooks (raw body)
app.use(errorHandler)
const PORT = process.env.PORT || 4000
app.listen(PORT, () => console.log(`Inkframe API running on port ${PORT}`))
export default app
0.3 Environment Variables
Server .env :
DATABASE_URL=postgresql://...
SUPABASE_URL=https://...supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
ANTHROPIC_API_KEY=sk-ant-...
JWT_SECRET=...
REDIS_URL=redis://localhost:6379
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
CLIENT_URL=http://localhost:3000
PORT=4000
Client .env.local :
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_SUPABASE_URL=https://...supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_...
Phase 1: Database & Auth (Week 1)
1.1 Prisma Schema
// server/prisma/schema.prisma
generator client {
provider = "prisma-client-js"
}
datasource db {
provider = "postgresql"
url = env("DATABASE_URL")
}
model User {
id String @id @default(uuid())
email String @unique
passwordHash String
plan Plan @default(STARTER)
stripeId String? @unique
booksThisMonth Int @default(0)
resetAt DateTime @default(now())
projects Project[]
createdAt DateTime @default(now())
updatedAt DateTime @updatedAt
}
model Project {
id String @id @default(uuid())
userId String
user User @relation(fields: [userId], references: [id], onDelete: Cascade)
title String @default("Untitled Book")
subtitle String @default("")
niche String @default("")
genre String @default("nonfiction")
status String @default("intake")
version Int @default(1)
wordTarget Int @default(50000)
wordCurrent Int @default(0)
context Json @default("{}")
checkpoints Json @default("{}")
chapters Chapter[]
resources ResourceChunk[]
executions SkillExecution[]
createdAt DateTime @default(now())
updatedAt DateTime @updatedAt
}
model Chapter {
id String @id @default(uuid())
projectId String
project chapterNumber Int
title String
status String @default("not_started")
draftText String? @db.Text
approvedText String? @db.Text
wordCount Int @default(0)
confidenceScore Float?
flags Json @default("[]")
revisionHistory Json @default("[]")
contextVersion Int @default(1)
createdAt DateTime @default(now())
updatedAt DateTime @updatedAt
Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
@@unique([projectId, chapterNumber])
}
model ResourceChunk {
id String @id @default(uuid())
projectId String
project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
source String
theme String
keywords Json
text String @db.Text
createdAt DateTime @default(now())
}
model SkillExecution {
id String @id @default(uuid())
projectId String
project Project @relation(fields: [projectId], references: [id])
skillName String
status String @default("pending")
inputSummary String?
output Json?
error String?
durationMs Int?
createdAt DateTime @default(now())
}
model QualityReport {
id String @id @default(uuid())
projectId String @unique
consistencyScore Float?
consistencyReport Json?
originalityScores Json @default("{}")
factReports Json @default("{}")
updatedAt DateTime @updatedAt
}
enum Plan {
STARTER
PROFESSIONAL
STUDIO
}
npx prisma migrate dev --name init
1.2 Auth Routes
// server/src/routes/auth.ts
import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { prisma } from '../db/client'
import { z } from 'zod'
const router = Router()
const signupSchema = z.object({
email: z.string().email(),
password: z.string().min(8)
})
router.post('/signup', async (req, res, next) => {
try {
const { email, password } = signupSchema.parse(req.body)
const existing = await prisma.user.findUnique({ where: { email } })
if (existing) return res.status(409).json({ error: 'Email already in use' })
const passwordHash = await bcrypt.hash(password, 12)
const user = await prisma.user.create({
data: { email, passwordHash },
select: { id: true, email: true, plan: true }
})
const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, { expiresIn: '7d' })
res.json({ user, token })
} catch (err) { next(err) }
})
router.post('/login', async (req, res, next) => {
try {
const { email, password } = signupSchema.parse(req.body)
const user = await prisma.user.findUnique({ where: { email } })
if (!user) return res.status(401).json({ error: 'Invalid credentials' })
const valid = await bcrypt.compare(password, user.passwordHash)
if (!valid) return res.status(401).json({ error: 'Invalid credentials' })
const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, { expiresIn: '7d' })
res.json({
user: { id: user.id, email: user.email, plan: user.plan },
token
})
} catch (err) { next(err) }
})
router.get('/me', requireAuth, async (req, res) => {
const user = await prisma.user.findUnique({
where: { id: req.userId },
select: { id: true, email: true, plan: true, booksThisMonth: true }
})
res.json(user)
})
export { router as authRouter }
1.3 Auth Middleware
// server/src/middleware/auth.ts
import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
declare global {
namespace Express {
interface Request { userId: string }
}
}
export function requireAuth(req: Request, res: Response, next: NextFunction) {
const token = req.headers.authorization?.replace('Bearer ', '')
if (!token) return res.status(401).json({ error: 'Unauthorized' })
try {
const payload = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string }
req.userId = payload.userId
next()
} catch {
res.status(401).json({ error: 'Invalid or expired token' })
}
}
1.4 Plan Limits Middleware
// server/src/middleware/planLimits.ts
import { Request, Response, NextFunction } from 'express'
import { prisma } from '../db/client'
const PLAN_LIMITS = {
STARTER: { booksPerMonth: 1, qualityLayer: false, inlineAgents: false },
PROFESSIONAL: { booksPerMonth: 3, qualityLayer: true, inlineAgents: true },
STUDIO: { booksPerMonth: 10, qualityLayer: true, inlineAgents: true }
}
export function requirePlan(...requiredFeatures: string[]) {
return async (req: Request, res: Response, next: NextFunction) => {
const user = await prisma.user.findUnique({ where: { id: req.userId } })
if (!user) return res.status(401).json({ error: 'User not found' })
const limits = PLAN_LIMITS[user.plan]
for (const feature of requiredFeatures) {
if (!limits[feature as keyof typeof limits]) {
return res.status(403).json({
error: 'Plan upgrade required',
feature,
currentPlan: user.plan,
upgradeUrl: '/settings/billing'
})
}
}
next()
}
}
Phase 2: Core Skill Infrastructure (Week 1–2)
2.1 Skill Executor — The Pattern Every Skill Follows
// server/src/lib/skillExecutor.ts
import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '../db/client'
import { Response } from 'express'
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
interface SkillConfig {
skillName: string
systemPrompt: string
userPrompt: string
projectId: string
stream?: boolean
res?: Response // for streaming
}
// Standard (non-streaming) skill call
export async function executeSkill(config: SkillConfig) {
const execution = await prisma.skillExecution.create({
data: { projectId: config.projectId, skillName: config.skillName, status: 'running' }
})
const startTime = Date.now()
try {
const message = await anthropic.messages.create({
model: 'claude-sonnet-4-6',
max_tokens: 4096,
system: config.systemPrompt,
messages: [{ role: 'user', content: config.userPrompt }]
})
const output = message.content[0].type === 'text' ? message.content[0].text : ''
await prisma.skillExecution.update({
where: { id: execution.id },
data: {
status: 'complete',
output: { text: output },
durationMs: Date.now() - startTime
}
})
return output
} catch (error: any) {
await prisma.skillExecution.update({
where: { id: execution.id },
data: { status: 'failed', error: error.message }
})
throw error
}
}
// Streaming skill call — pipes directly to Express response
export async function executeSkillStream(config: SkillConfig) {
if (!config.res) throw new Error('Response object required for streaming')
config.res.setHeader('Content-Type', 'text/event-stream')
config.res.setHeader('Cache-Control', 'no-cache')
config.res.setHeader('Connection', 'keep-alive')
const execution = await prisma.skillExecution.create({
data: { projectId: config.projectId, skillName: config.skillName, status: 'running' }
})
let fullText = ''
const stream = await anthropic.messages.stream({
model: 'claude-sonnet-4-6',
max_tokens: 4096,
system: config.systemPrompt,
messages: [{ role: 'user', content: config.userPrompt }]
})
for await (const chunk of stream) {
if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
const text = chunk.delta.text
fullText += text
config.res.write(`data: ${JSON.stringify({ text })}\n\n`)
}
}
config.res.write(`data: ${JSON.stringify({ done: true })}\n\n`)
config.res.end()
await prisma.skillExecution.update({
where: { id: execution.id },
data: { status: 'complete', output: { text: fullText } }
})
return fullText
}
2.2 Context Helper
// server/src/lib/contextHelper.ts
import { prisma } from '../db/client'
export async function getProjectContext(projectId: string, userId: string) {
const project = await prisma.project.findFirst({
where: { id: projectId, userId }, // userId scoping — critical security check
include: { chapters: true, resources: true }
})
if (!project) throw new Error('Project not found')
return project
}
export async function updateContext(projectId: string, updates: Record<string, any>) {
const project = await prisma.project.findUnique({ where: { id: projectId } })
const currentContext = (project?.context as Record<string, any>) || {}
const merged = { ...currentContext, ...updates, updatedAt: new Date().toISOString() }
return prisma.project.update({
where: { id: projectId },
data: { context: merged, updatedAt: new Date() }
})
}
export async function updateCheckpoint(projectId: string, checkpoint: string, value: string)
const project = await prisma.project.findUnique({ where: { id: projectId } })
const checkpoints = (project?.checkpoints as Record<string, string>) || {}
checkpoints[checkpoint] = value
return prisma.project.update({
where: { id: projectId },
data: { checkpoints }
})
}
export async function getRelevantChunks(projectId: string, keywords: string[], topN = 5) {
const chunks = await prisma.resourceChunk.findMany({ where: { projectId } })
// Score chunks by keyword overlap
const scored = chunks.map(chunk => {
const chunkKeywords = (chunk.keywords as string[]) || []
const overlap = keywords.filter(kw =>
chunkKeywords.some(ck => ck.toLowerCase().includes(kw.toLowerCase()))
).length
return { chunk, score: overlap / Math.max(keywords.length, 1) }
})
return scored
.filter(s => s.score > 0)
.sort((a, b) => b.score - a.score)
.slice(0, topN)
.map(s => s.chunk)
}
2.3 Skill Routes
// server/src/routes/skills.ts
import { Router } from 'express'
import { requireAuth } from '../middleware/auth'
import { requirePlan } from '../middleware/planLimits'
import * as MarketAnalysis from '../skills/marketAnalysis'
import * as TitleGenerator from '../skills/titleGenerator'
import * as ReaderPersona from '../skills/readerPersona'
import * as ResourceIngestion from '../skills/resourceIngestion'
import * as AuthorPersona from '../skills/authorPersona'
import * as OutlineBuilder from '../skills/outlineBuilder'
import * as ChapterWriter from '../skills/chapterWriter'
import * as InlineAgents from '../skills/inlineAgents'
import * as ConsistencyChecker from '../skills/consistencyChecker'
import * as FactVerifier from '../skills/factVerifier'
import * as OriginalityReviewer from '../skills/originalityReviewer'
import * as EditorReview from '../skills/editorReview'
import * as BookDescription from '../skills/bookDescription'
import * as CoverDesign from '../skills/coverDesign'
import * as ExportFormatter from '../skills/exportFormatter'
import * as ContentRepurposer from '../skills/contentRepurposer'
import multer from 'multer'
const router = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024
// All skill routes require auth
router.use(requireAuth)
// ── Layer 1: Context Building ──────────────────────────────────────────
router.post('/market-analysis', MarketAnalysis.run)
router.post('/title-generator', TitleGenerator.run)
router.post('/reader-persona', ReaderPersona.run)
router.post('/resource-ingestion', upload.array('files', 10), ResourceIngestion.run)
router.post('/author-persona', AuthorPersona.run)
router.post('/outline-builder', OutlineBuilder.run)
router.post('/outline-approve', OutlineBuilder.approve)
// ── Layer 2: Writing ───────────────────────────────────────────────────
router.post('/chapter-writer', ChapterWriter.run) // SSE streaming
router.post('/inline-agents', requirePlan('inlineAgents'), InlineAgents.run)
// ── Layer 3: Quality Control ───────────────────────────────────────────
router.post('/consistency-checker', requirePlan('qualityLayer'), ConsistencyChecker.run)
router.post('/fact-verifier', requirePlan('qualityLayer'), FactVerifier.run)
router.post('/originality-reviewer', requirePlan('qualityLayer'), OriginalityReviewer.run)
router.post('/editor-review', EditorReview.run)
// ── Layer 4: Packaging ─────────────────────────────────────────────────
router.post('/book-description', BookDescription.run)
router.post('/cover-design', CoverDesign.run)
router.post('/export-formatter', ExportFormatter.run) // async job
router.post('/content-repurposer', requirePlan('inlineAgents'), ContentRepurposer.run)
export { router as skillRouter }
2.4 Example Skill Implementation — Chapter Writer
// server/src/skills/chapterWriter.ts
import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { getProjectContext, getRelevantChunks } from '../lib/contextHelper'
import { executeSkillStream } from '../lib/skillExecutor'
import { prisma } from '../db/client'
import { parseConfidenceBlock } from '../lib/parseConfidence'
const schema = z.object({
projectId: z.string().uuid(),
chapterNumber: z.number().int().min(1),
sectionIndex: z.number().int().min(0)
})
export async function run(req: Request, res: Response, next: NextFunction) {
try {
const { projectId, chapterNumber, sectionIndex } = schema.parse(req.body)
const project = await getProjectContext(projectId, req.userId)
const context = project.context as Record<string, any>
// Gate: outline must be approved
const checkpoints = project.checkpoints as Record<string, string>
if (checkpoints.outline_approved !== 'complete') {
return res.status(400).json({ error: 'Outline must be approved before writing' })
}
// Get the chapter outline
const outline = context.outline?.chapters?.find(
(c: any) => c.number === chapterNumber
)
if (!outline) return res.status(404).json({ error: 'Chapter not found in outline' })
const section = outline.sections?.[sectionIndex]
if (!section) return res.status(404).json({ error: 'Section not found' })
// Retrieve relevant resource chunks
const keywords = section.key_points?.join(' ').split(' ') || []
const chunks = await getRelevantChunks(projectId, keywords, 5)
const chunkText = chunks.map(c => c.text).join('\n---\n')
const voiceProfile = context.voice?.voice_profile_prompt || ''
const readerCalibration = context.audience?.writing_calibration_block || ''
const systemPrompt = `You are an expert nonfiction book writer.
[VOICE PROFILE]
${voiceProfile}
[/VOICE PROFILE]
[READER CALIBRATION]
${readerCalibration}
[/READER CALIBRATION]
After writing the section, append this exact block:
---
CONFIDENCE: [0.0-1.0]
FLAGS:
- [any issues or uncertainties]
RECOMMENDED_ACTION: [proceed|surface_to_user|invoke_agent]
---`
const userPrompt = `Book: "${project.title}"
Chapter ${chapterNumber}: "${outline.title}"
Core argument: ${outline.core_argument}
Write the section titled: "${section.title}"
Key points to cover:
${section.key_points?.map((p: string) => `- ${p}`).join('\n')}
Target word count: ${section.word_count_target || 800} words (±10%)
Reference material (use where relevant):
---
${chunkText}
---
Do NOT use: "it is important to note", "furthermore", "in conclusion", "delve into".
Do NOT open with a definition.
Open with something that creates immediate engagement.`
// Stream response back to client
await executeSkillStream({
skillName: 'chapter-writer',
systemPrompt,
userPrompt,
projectId,
stream: true,
res
})
} catch (err) { next(err) }
}
Phase 3: Project Routes (Week 2)
// server/src/routes/projects.ts
import { Router } from 'express'
import { requireAuth } from '../middleware/auth'
import { prisma } from '../db/client'
import { z } from 'zod'
const router = Router()
router.use(requireAuth)
// List all projects for the user
router.get('/', async (req, res, next) => {
try {
const projects = await prisma.project.findMany({
where: { userId: req.userId },
select: {
id: true, title: true, subtitle: true, status: true,
wordTarget: true, wordCurrent: true, checkpoints: true,
createdAt: true, updatedAt: true,
_count: { select: { chapters: true } }
},
orderBy: { updatedAt: 'desc' }
})
res.json(projects)
} catch (err) { next(err) }
})
// Create new project
router.post('/', async (req, res, next) => {
try {
const { title, niche, genre, wordTarget } = req.body
// Check monthly book limit
const user = await prisma.user.findUnique({ where: { id: req.userId } })
const limits = { STARTER: 1, PROFESSIONAL: 3, STUDIO: 10 }
if (user!.booksThisMonth >= limits[user!.plan]) {
return res.status(403).json({ error: 'Monthly book limit reached for your plan' })
}
const project = await prisma.project.create({
data: {
userId: req.userId,
title: title || 'Untitled Book',
niche: niche || '',
genre: genre || 'nonfiction',
wordTarget: wordTarget || 50000,
checkpoints: {
market_analysis: 'not_started',
title_selected: 'not_started',
reader_persona: 'not_started',
resources_ingested: 'not_started',
author_persona: 'not_started',
outline_approved: 'not_started',
chapters_written: 'not_started',
quality_reviewed: 'not_started',
exported: 'not_started'
}
}
})
// Increment user's book count
await prisma.user.update({
where: { id: req.userId },
data: { booksThisMonth: { increment: 1 } }
})
res.status(201).json(project)
} catch (err) { next(err) }
})
// Get single project with full context
router.get('/:id', async (req, res, next) => {
try {
const project = await prisma.project.findFirst({
where: { id: req.params.id, userId: req.userId },
include: {
chapters: { orderBy: { chapterNumber: 'asc' } },
_count: { select: { resources: true } }
}
})
if (!project) return res.status(404).json({ error: 'Project not found' })
res.json(project)
} catch (err) { next(err) }
})
// Update project (title, context fields, checkpoints)
router.patch('/:id', async (req, res, next) => {
try {
const project = await prisma.project.findFirst({
where: { id: req.params.id, userId: req.userId }
})
if (!project) return res.status(404).json({ error: 'Project not found' })
const updated = await prisma.project.update({
where: { id: req.params.id },
data: { ...req.body, updatedAt: new Date() }
})
res.json(updated)
} catch (err) { next(err) }
})
// Delete project
router.delete('/:id', async (req, res, next) => {
try {
await prisma.project.deleteMany({
where: { id: req.params.id, userId: req.userId }
})
res.json({ success: true })
} catch (err) { next(err) }
})
// Chapter routes
router.get('/:id/chapters', async (req, res, next) => {
try {
const chapters = await prisma.chapter.findMany({
where: { projectId: req.params.id, project: { userId: req.userId } },
orderBy: { chapterNumber: 'asc' }
})
res.json(chapters)
} catch (err) { next(err) }
})
router.patch('/:id/chapters/:chapterNum', async (req, res, next) => {
try {
const chapter = await prisma.chapter.update({
where: {
projectId_chapterNumber: {
projectId: req.params.id,
chapterNumber: parseInt(req.params.chapterNum)
}
},
data: { ...req.body, updatedAt: new Date() }
})
res.json(chapter)
} catch (err) { next(err) }
})
export { router as projectRouter }
Phase 4: Background Jobs with BullMQ (Week 3)
For long-running tasks: resource ingestion, export formatting, content repurposing.
// server/src/jobs/queue.ts
import { Queue, Worker } from 'bullmq'
import IORedis from 'ioredis'
const connection = new IORedis(process.env.REDIS_URL!, { maxRetriesPerRequest: null })
export const ingestionQueue = new Queue('resource-ingestion', { connection })
export const exportQueue = new Queue('export', { connection })
export const repurposeQueue = new Queue('repurpose', { connection })
// server/src/jobs/workers/ingestionWorker.ts
import { Worker } from 'bullmq'
import { prisma } from '../../db/client'
import { splitIntoChunks, extractKeywords } from '../../lib/chunker'
new Worker('resource-ingestion', async (job) => {
const { projectId, fileName, fileBuffer, mimeType } = job.data
await job.updateProgress(10)
// Extract text based on file type
let text = ''
if (mimeType === 'text/plain' || mimeType === 'text/markdown') {
text = fileBuffer.toString('utf-8')
}
// PDF extraction would use pdf-parse here
// DOCX extraction would use mammoth here
await job.updateProgress(30)
// Chunk the text
const rawChunks = splitIntoChunks(text, 400)
await job.updateProgress(60)
// Save chunks to database
const chunks = rawChunks.map((chunkText, i) => ({
projectId,
source: fileName,
theme: extractKeywords(chunkText).slice(0, 2).join(' '),
keywords: extractKeywords(chunkText),
text: chunkText
}))
await prisma.resourceChunk.createMany({ data: chunks })
await job.updateProgress(100)
return { chunksCreated: chunks.length, wordCount: text.split(' ').length }
}, { connection })
Phase 5: Next.js Frontend (Week 3–6)
5.1 API Client
// client/lib/api.ts
import axios from 'axios'
const api = axios.create({
baseURL: process.env.NEXT_PUBLIC_API_URL,
withCredentials: true
})
// Attach JWT token to every request
api.interceptors.request.use(config => {
const token = localStorage.getItem('inkframe_token')
if (token) config.headers.Authorization = `Bearer ${token}`
return config
})
// Redirect to login on 401
api.interceptors.response.use(
res => res,
err => {
if (err.response?.status === 401) {
localStorage.removeItem('inkframe_token')
window.location.href = '/login'
}
return Promise.reject(err)
}
)
export default api
5.2 Auth Store (Zustand)
// client/lib/stores/authStore.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import api from '../api'
interface AuthStore {
user: any | null
token: string | null
login: (email: string, password: string) => Promise<void>
logout: () => void
signup: (email: string, password: string) => Promise<void>
}
export const useAuthStore = create<AuthStore>()(
persist(
(set) => ({
user: null,
token: null,
login: async (email, password) => {
const { data } = await api.post('/api/auth/login', { email, password })
localStorage.setItem('inkframe_token', data.token)
set({ user: data.user, token: data.token })
},
logout: () => {
localStorage.removeItem('inkframe_token')
set({ user: null, token: null })
},
signup: async (email, password) => {
const { data } = await api.post('/api/auth/signup', { email, password })
localStorage.setItem('inkframe_token', data.token)
set({ user: data.user, token: data.token })
}
}),
{ name: 'inkframe-auth', partialize: (s) => ({ token: s.token, user: s.user }) }
)
)
5.3 Streaming Hook
// client/hooks/useSkillStream.ts
import { useState, useCallback } from 'react'
export function useSkillStream() {
const [output, setOutput] = useState('')
const [streaming, setStreaming] = useState(false)
const [done, setDone] = useState(false)
const stream = useCallback(async (endpoint: string, body: object) => {
setOutput('')
setStreaming(true)
setDone(false)
const token = localStorage.getItem('inkframe_token')
const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${endpoint}`, {
method: 'POST',
headers: {
'Content-Type': 'application/json',
'Authorization': `Bearer ${token}`
},
body: JSON.stringify(body)
})
const reader = res.body!.getReader()
const decoder = new TextDecoder()
while (true) {
const { done: streamDone, value } = await reader.read()
if (streamDone) break
const lines = decoder.decode(value).split('\n')
for (const line of lines) {
if (line.startsWith('data: ')) {
const data = JSON.parse(line.slice(6))
if (data.done) { setDone(true); break }
if (data.text) setOutput(prev => prev + data.text)
}
}
}
setStreaming(false)
}, [])
return { output, streaming, done, stream }
}
5.4 Page Structure
client/app/
├── (auth)/
│ ├── login/page.tsx
│ └── signup/page.tsx
├── (app)/
│ ├── layout.tsx ← Protected layout with sidebar
│ ├── dashboard/page.tsx ← All projects
│ ├── projects/
│ │ └── [id]/
│ │ ├── setup/
│ │ │ └── page.tsx ← Wizard (steps 1-6)
│ │ ├── write/
│ │ │ └── page.tsx ← Writing workspace
│ │ ├── quality/
│ │ │ └── page.tsx ← Quality dashboard
│ │ └── export/
│ │ └── page.tsx ← Export & packaging
├── pricing/page.tsx
└── settings/
└── billing/page.tsx
5.5 Writing Workspace Layout
// client/app/(app)/projects/[id]/write/page.tsx
'use client'
import { useState } from 'react'
import { ChapterNavigator } from '@/components/write/ChapterNavigator'
import { SectionEditor } from '@/components/write/SectionEditor'
import { ContextDrawer } from '@/components/write/ContextDrawer'
import { useSkillStream } from '@/hooks/useSkillStream'
export default function WritePage({ params }: { params: { id: string } }) {
const [activeChapter, setActiveChapter] = useState(1)
const [activeSection, setActiveSection] = useState(0)
const { output, streaming, stream } = useSkillStream()
const writeSection = () => stream('/api/skills/chapter-writer', {
projectId: params.id,
chapterNumber: activeChapter,
sectionIndex: activeSection
})
return (
<div className="flex h-screen overflow-hidden">
{/* Left: Chapter navigator */}
<aside className="w-64 border-r flex-shrink-0 overflow-y-auto">
<ChapterNavigator
projectId={params.id}
activeChapter={activeChapter}
onSelect={setActiveChapter}
/>
</aside>
{/* Center: Editor */}
<main className="flex-1 overflow-y-auto p-8">
<SectionEditor
output={output}
streaming={streaming}
onWrite={writeSection}
projectId={params.id}
chapterNumber={activeChapter}
sectionIndex={activeSection}
onSectionComplete={() => setActiveSection(s => s + 1)}
/>
</main>
{/* Right: Context drawer */}
<aside className="w-72 border-l flex-shrink-0 overflow-y-auto">
<ContextDrawer projectId={params.id} chapterNumber={activeChapter} />
</aside>
</div>
)
}
Phase 6: Stripe Integration (Week 8)
// server/src/routes/webhooks.ts
import { Router } from 'express'
import Stripe from 'stripe'
import { prisma } from '../db/client'
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
const router = Router()
// Raw body required for Stripe webhook verification
router.post('/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
const sig = req.headers['stripe-signature']!
let event: Stripe.Event
try {
} catch {
event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
return res.status(400).send('Webhook signature verification failed')
}
switch (event.type) {
case 'customer.subscription.created':
case 'customer.subscription.updated': {
const sub = event.data.object as Stripe.Subscription
const planMap: Record<string, 'STARTER' | 'PROFESSIONAL' | 'STUDIO'> = {
[process.env.STRIPE_STARTER_PRICE_ID!]: 'STARTER',
[process.env.STRIPE_PRO_PRICE_ID!]: 'PROFESSIONAL',
[process.env.STRIPE_STUDIO_PRICE_ID!]: 'STUDIO',
}
const plan = planMap[sub.items.data[0].price.id] || 'STARTER'
await prisma.user.update({
where: { stripeId: sub.customer as string },
data: { plan }
})
break
}
case 'customer.subscription.deleted': {
const sub = event.data.object as Stripe.Subscription
await prisma.user.update({
where: { stripeId: sub.customer as string },
data: { plan: 'STARTER' }
})
break
}
}
res.json({ received: true })
})
export { router as webhookRouter }
Phase 7: Deployment (Week 9–10)
Railway (Express Server)
# railway.toml
[build]
builder = "nixpacks"
buildCommand = "npm install && npx prisma generate && npm run build"
[deploy]
startCommand = "npm start"
healthcheckPath = "/health"
Vercel (Next.js Client)
// client/vercel.json
{
"env": {
"NEXT_PUBLIC_API_URL": "@inkframe-api-url"
}
}
Docker Compose (Local Development)
# docker-compose.yml
version: '3.8'
services:
postgres:
image: postgres:15
environment:
POSTGRES_DB: inkframe
POSTGRES_USER: inkframe
POSTGRES_PASSWORD: localpassword
ports: ["5432:5432"]
volumes: [postgres_data:/var/lib/postgresql/data]
redis:
image: redis:7
ports: ["6379:6379"]
server:
build: ./server
ports: ["4000:4000"]
env_file: ./server/.env
depends_on: [postgres, redis]
volumes: [./server:/app, /app/node_modules]
command: npm run dev
volumes:
postgres_data:
Build Milestones
Week Milestone Done When
1 Auth + DB Login works, project creates in DB
2 First skill Chapter writer streams to browser
3 Setup wizard All 6 context skills working
4 Writing workspace Full write loop with inline agents
5 Quality layer Fact check, consistency, originality all functional
6 Export Real DOCX/PDF downloading
7 Stripe Subscriptions live, plan limits enforced
8 Polish Error states, loading states, mobile responsive
9 Deploy Express on Railway, Next.js on Vercel, all envs set
10 Launch Product Hunt launch
Start Tomorrow — In Order
1. git init inkframe → scaffold both folders → docker compose up
2. 3. 4. 5. Build the Express auth routes → test with Postman
Build the chapter writer skill endpoint → test with curl, see Claude respond
Build the Next.js login page → connect to Express auth
Build the simplest writing UI — one button calls chapter writer and streams output to a
textarea
Everything else is built on top of those five things.
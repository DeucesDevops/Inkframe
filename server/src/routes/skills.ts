import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { requirePlan } from '../middleware/planLimits.js'
import * as ChapterWriter from '../skills/chapterWriter.js'
import * as ResourceIngestion from '../skills/resourceIngestion.js'
import multer from 'multer'

const router = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })

// All skill routes require auth
router.use(requireAuth)

// ── Layer 1: Context Building ──────────────────────────────────────────
router.post('/resource-ingestion', upload.array('files', 10), ResourceIngestion.run)

// ── Layer 2: Writing ───────────────────────────────────────────────────
router.post('/chapter-writer', ChapterWriter.run) // SSE streaming

export { router as skillRouter }

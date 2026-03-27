import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import * as ai from '../controllers/ai.js'

export const aiRouter = Router()

aiRouter.post('/outline', requireAuth, ai.generateOutline)
aiRouter.post('/continue', requireAuth, ai.continueWriting)
aiRouter.post('/rewrite', requireAuth, ai.rewriteText)
aiRouter.post('/summarize', requireAuth, ai.summarizeChapter)
aiRouter.post('/suggest-title', requireAuth, ai.suggestTitles)

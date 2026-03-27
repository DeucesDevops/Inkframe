import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { getPresignedUrl } from '../lib/s3.js'

export const filesRouter = Router()

// GET /api/files/signed-url?key=...
filesRouter.get('/signed-url', requireAuth, async (req, res) => {
  const { key } = req.query as { key: string }
  if (!key) return res.status(400).json({ error: 'key is required' })
  const url = await getPresignedUrl(key)
  res.json({ url })
})

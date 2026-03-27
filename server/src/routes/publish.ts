import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { prisma } from '../db/client.js'
import { complete } from '../lib/claude.js'

export const publishRouter = Router()

const KDP_PROMPT = `You are an Amazon KDP publishing expert. Generate optimised book metadata that will maximise discoverability on Amazon. Follow Amazon's content guidelines. Return ONLY valid JSON (no markdown, no backticks) with exactly these fields: description (HTML formatted string, up to 4000 chars), keywords (array of 7 keyword phrase strings), categories (array of 2 objects each with bisac, name, and reason fields).`

// POST /api/publish/metadata
publishRouter.post('/metadata', requireAuth, async (req, res) => {
  const { bookId, synopsis } = req.body
  const book = await prisma.book.findFirst({
    where: { id: bookId, userId: req.userId },
  })
  if (!book) return res.status(404).json({ error: 'Book not found' })
  const userPrompt = `Title: ${book.title}\nGenre: ${book.genre || 'general'}\nSynopsis: ${synopsis || book.description || 'No synopsis provided'}`
  try {
    const raw = await complete(KDP_PROMPT, userPrompt)
    const metadata = JSON.parse(raw)
    res.json(metadata)
  } catch {
    res.status(500).json({ error: 'Failed to generate metadata' })
  }
})

// POST /api/publish/checklist
publishRouter.post('/checklist', requireAuth, async (req, res) => {
  const { bookId } = req.body
  const book = await prisma.book.findFirst({
    where: { id: bookId, userId: req.userId },
    include: {
      chapters: true,
      exports: true,
    },
  })
  if (!book) return res.status(404).json({ error: 'Book not found' })

  const totalWords = book.chapters.reduce((sum, ch) => sum + ch.wordCount, 0)
  const hasEpub = book.exports.some(e => e.format === 'EPUB' && e.status === 'DONE')

  const checklist = [
    { item: 'Book title set', done: Boolean(book.title && book.title.length > 0) },
    { item: 'Book description written (100+ chars)', done: Boolean(book.description && book.description.length >= 100) },
    { item: 'At least 5 chapters', done: book.chapters.length >= 5 },
    { item: 'Minimum 10,000 words', done: totalWords >= 10000 },
    { item: 'ePub exported successfully', done: hasEpub },
  ]

  res.json({ checklist, totalWords, chapterCount: book.chapters.length })
})

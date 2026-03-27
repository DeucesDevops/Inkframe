import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { prisma } from '../db/client.js'
import { getPresignedUrl } from '../lib/s3.js'
import { audioQueue } from '../jobs/queue.js'

export const audioRouter = Router()

// POST /api/audio
audioRouter.post('/', requireAuth, async (req, res) => {
  const { bookId, chapterId, voice } = req.body
  const book = await prisma.book.findFirst({ where: { id: bookId as string, userId: req.userId } })
  if (!book) return res.status(404).json({ error: 'Book not found' })
  const audioFile = await prisma.audioFile.create({
    data: {
      bookId,
      chapterId: chapterId || null,
      voice: voice || '21m00Tcm4TlvDq8ikWAM',
      status: 'PENDING',
    },
  })
  await audioQueue.add('audio', {
    bookId,
    audioFileId: audioFile.id,
    chapterId: chapterId || null,
    voice: audioFile.voice,
  })
  res.status(201).json(audioFile)
})

// GET /api/audio/:bookId
audioRouter.get('/:bookId', requireAuth, async (req, res) => {
  const bookId = req.params.bookId as string
  const book = await prisma.book.findFirst({ where: { id: bookId, userId: req.userId } })
  if (!book) return res.status(404).json({ error: 'Book not found' })
  const files = await prisma.audioFile.findMany({
    where: { bookId },
    orderBy: { createdAt: 'desc' },
  })
  res.json(files)
})

// GET /api/audio/:id/download
audioRouter.get('/:id/download', requireAuth, async (req, res) => {
  const id = req.params.id as string
  const audioFile = await prisma.audioFile.findFirst({
    where: { id },
    include: { book: { select: { userId: true } } },
  })
  if (!audioFile || audioFile.book.userId !== req.userId) {
    return res.status(404).json({ error: 'Audio file not found' })
  }
  if (!audioFile.s3Key) return res.status(400).json({ error: 'File not yet available' })
  const url = await getPresignedUrl(audioFile.s3Key)
  res.json({ url })
})

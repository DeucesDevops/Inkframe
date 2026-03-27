import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { prisma } from '../db/client.js'
import { getPresignedUrl } from '../lib/s3.js'
import { epubQueue, pdfQueue } from '../jobs/queue.js'

export const exportRouter = Router()

// POST /api/export
exportRouter.post('/', requireAuth, async (req, res) => {
  const { bookId, format } = req.body
  const book = await prisma.book.findFirst({ where: { id: bookId as string, userId: req.userId } })
  if (!book) return res.status(404).json({ error: 'Book not found' })
  const exportRecord = await prisma.export.create({
    data: { bookId, format, status: 'PENDING' },
  })
  if (format === 'EPUB') {
    await epubQueue.add('epub', { bookId, exportId: exportRecord.id, userId: req.userId })
  } else if (format === 'PDF_DIGITAL') {
    await pdfQueue.add('pdf', { bookId, exportId: exportRecord.id, pdfType: 'digital' })
  } else if (format === 'PDF_PRINT') {
    await pdfQueue.add('pdf', { bookId, exportId: exportRecord.id, pdfType: 'print' })
  }
  res.status(201).json(exportRecord)
})

// GET /api/export/:bookId
exportRouter.get('/:bookId', requireAuth, async (req, res) => {
  const bookId = req.params.bookId as string
  const book = await prisma.book.findFirst({ where: { id: bookId, userId: req.userId } })
  if (!book) return res.status(404).json({ error: 'Book not found' })
  const exports = await prisma.export.findMany({
    where: { bookId },
    orderBy: { createdAt: 'desc' },
  })
  res.json(exports)
})

// GET /api/export/:id/download
exportRouter.get('/:id/download', requireAuth, async (req, res) => {
  const id = req.params.id as string
  const exportRecord = await prisma.export.findFirst({
    where: { id },
    include: { book: { select: { userId: true } } },
  })
  if (!exportRecord || exportRecord.book.userId !== req.userId) {
    return res.status(404).json({ error: 'Export not found' })
  }
  if (!exportRecord.s3Key) return res.status(400).json({ error: 'File not yet available' })
  const url = await getPresignedUrl(exportRecord.s3Key)
  res.json({ url })
})

import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { prisma } from '../db/client.js'
import { countWords } from '../lib/htmlUtils.js'

export const chapterRouter = Router({ mergeParams: true })

// GET /api/books/:bookId/chapters
chapterRouter.get('/', requireAuth, async (req, res) => {
  const bookId = req.params.bookId as string
  const book = await prisma.book.findFirst({ where: { id: bookId, userId: req.userId } })
  if (!book) return res.status(404).json({ error: 'Book not found' })
  const chapters = await prisma.bookChapter.findMany({
    where: { bookId },
    orderBy: { order: 'asc' },
  })
  res.json(chapters)
})

// POST /api/books/:bookId/chapters
chapterRouter.post('/', requireAuth, async (req, res) => {
  const bookId = req.params.bookId as string
  const book = await prisma.book.findFirst({ where: { id: bookId, userId: req.userId } })
  if (!book) return res.status(404).json({ error: 'Book not found' })
  const { title, content } = req.body
  if (!title) return res.status(400).json({ error: 'Title is required' })
  const maxOrder = await prisma.bookChapter.aggregate({
    where: { bookId },
    _max: { order: true },
  })
  const order = ((maxOrder._max as { order: number | null }).order ?? 0) + 1
  const chapter = await prisma.bookChapter.create({
    data: { bookId, title, content: content || '', order, wordCount: countWords(content || '') },
  })
  res.status(201).json(chapter)
})

// PATCH /api/books/:bookId/chapters/reorder — must be defined before /:id
chapterRouter.patch('/reorder', requireAuth, async (req, res) => {
  const bookId = req.params.bookId as string
  const book = await prisma.book.findFirst({ where: { id: bookId, userId: req.userId } })
  if (!book) return res.status(404).json({ error: 'Book not found' })
  const { orderedIds } = req.body as { orderedIds: string[] }
  await Promise.all(
    orderedIds.map((id, index) =>
      prisma.bookChapter.update({ where: { id }, data: { order: index + 1 } })
    )
  )
  res.json({ success: true })
})

// GET /api/books/:bookId/chapters/:id
chapterRouter.get('/:id', requireAuth, async (req, res) => {
  const bookId = req.params.bookId as string
  const id = req.params.id as string
  const book = await prisma.book.findFirst({ where: { id: bookId, userId: req.userId } })
  if (!book) return res.status(404).json({ error: 'Book not found' })
  const chapter = await prisma.bookChapter.findFirst({ where: { id, bookId } })
  if (!chapter) return res.status(404).json({ error: 'Chapter not found' })
  res.json(chapter)
})

// PATCH /api/books/:bookId/chapters/:id
chapterRouter.patch('/:id', requireAuth, async (req, res) => {
  const bookId = req.params.bookId as string
  const id = req.params.id as string
  const book = await prisma.book.findFirst({ where: { id: bookId, userId: req.userId } })
  if (!book) return res.status(404).json({ error: 'Book not found' })
  const { title, content, status } = req.body
  const updated = await prisma.bookChapter.update({
    where: { id },
    data: {
      title,
      content,
      status,
      wordCount: content !== undefined ? countWords(content) : undefined,
    },
  })
  res.json(updated)
})

// DELETE /api/books/:bookId/chapters/:id
chapterRouter.delete('/:id', requireAuth, async (req, res) => {
  const bookId = req.params.bookId as string
  const id = req.params.id as string
  const book = await prisma.book.findFirst({ where: { id: bookId, userId: req.userId } })
  if (!book) return res.status(404).json({ error: 'Book not found' })
  await prisma.bookChapter.delete({ where: { id } })
  res.json({ success: true })
})

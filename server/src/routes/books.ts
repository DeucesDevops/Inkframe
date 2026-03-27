import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { prisma } from '../db/client.js'

export const bookRouter = Router()

// GET /api/books
bookRouter.get('/', requireAuth, async (req, res) => {
  const books = await prisma.book.findMany({
    where: { userId: req.userId },
    include: { _count: { select: { chapters: true } } },
    orderBy: { updatedAt: 'desc' },
  })
  res.json(books)
})

// POST /api/books
bookRouter.post('/', requireAuth, async (req, res) => {
  const { title, subtitle, description, genre, targetWords } = req.body
  if (!title) return res.status(400).json({ error: 'Title is required' })
  const book = await prisma.book.create({
    data: { userId: req.userId, title, subtitle, description, genre, targetWords },
  })
  res.status(201).json(book)
})

// GET /api/books/:id
bookRouter.get('/:id', requireAuth, async (req, res) => {
  const id = req.params.id as string
  const book = await prisma.book.findFirst({
    where: { id, userId: req.userId },
    include: {
      chapters: { orderBy: { order: 'asc' } },
      exports: { orderBy: { createdAt: 'desc' } },
      audioFiles: { orderBy: { createdAt: 'desc' } },
    },
  })
  if (!book) return res.status(404).json({ error: 'Book not found' })
  res.json(book)
})

// PATCH /api/books/:id
bookRouter.patch('/:id', requireAuth, async (req, res) => {
  const id = req.params.id as string
  const { title, subtitle, description, genre, targetWords, status } = req.body
  const book = await prisma.book.findFirst({ where: { id, userId: req.userId } })
  if (!book) return res.status(404).json({ error: 'Book not found' })
  const updated = await prisma.book.update({
    where: { id },
    data: { title, subtitle, description, genre, targetWords, status },
  })
  res.json(updated)
})

// DELETE /api/books/:id
bookRouter.delete('/:id', requireAuth, async (req, res) => {
  const id = req.params.id as string
  const book = await prisma.book.findFirst({ where: { id, userId: req.userId } })
  if (!book) return res.status(404).json({ error: 'Book not found' })
  await prisma.book.delete({ where: { id } })
  res.json({ success: true })
})

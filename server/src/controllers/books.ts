import { Request, Response, NextFunction } from 'express'
import { prisma } from '../db/client.js'
import { countWords } from '../lib/htmlUtils.js'

// ── Books ───────────────────────────────────────────────────────────────────

export const listBooks = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const books = await prisma.book.findMany({
      where: { userId: req.userId },
      include: { _count: { select: { chapters: true } } },
      orderBy: { updatedAt: 'desc' },
    })
    res.json(books)
  } catch (err) { next(err) }
}

export const createBook = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { title, subtitle, description, genre, targetWords } = req.body
    if (!title) return res.status(400).json({ error: 'Title is required' })
    const book = await prisma.book.create({
      data: { userId: req.userId, title, subtitle, description, genre, targetWords },
    })
    res.status(201).json(book)
  } catch (err) { next(err) }
}

export const getBook = async (req: Request, res: Response, next: NextFunction) => {
  try {
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
  } catch (err) { next(err) }
}

export const updateBook = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string
    const { title, subtitle, description, genre, targetWords, status } = req.body
    const book = await prisma.book.findFirst({ where: { id, userId: req.userId } })
    if (!book) return res.status(404).json({ error: 'Book not found' })
    const updated = await prisma.book.update({
      where: { id },
      data: { title, subtitle, description, genre, targetWords, status },
    })
    res.json(updated)
  } catch (err) { next(err) }
}

export const deleteBook = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string
    const book = await prisma.book.findFirst({ where: { id, userId: req.userId } })
    if (!book) return res.status(404).json({ error: 'Book not found' })
    await prisma.book.delete({ where: { id } })
    res.json({ success: true })
  } catch (err) { next(err) }
}

// ── Book Chapters ────────────────────────────────────────────────────────────

export const listBookChapters = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const bookId = req.params.bookId as string
    const book = await prisma.book.findFirst({ where: { id: bookId, userId: req.userId } })
    if (!book) return res.status(404).json({ error: 'Book not found' })
    const chapters = await prisma.bookChapter.findMany({
      where: { bookId },
      orderBy: { order: 'asc' },
    })
    res.json(chapters)
  } catch (err) { next(err) }
}

export const createBookChapter = async (req: Request, res: Response, next: NextFunction) => {
  try {
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
  } catch (err) { next(err) }
}

export const reorderBookChapters = async (req: Request, res: Response, next: NextFunction) => {
  try {
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
  } catch (err) { next(err) }
}

export const getBookChapter = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const bookId = req.params.bookId as string
    const id = req.params.id as string
    const book = await prisma.book.findFirst({ where: { id: bookId, userId: req.userId } })
    if (!book) return res.status(404).json({ error: 'Book not found' })
    const chapter = await prisma.bookChapter.findFirst({ where: { id, bookId } })
    if (!chapter) return res.status(404).json({ error: 'Chapter not found' })
    res.json(chapter)
  } catch (err) { next(err) }
}

export const updateBookChapter = async (req: Request, res: Response, next: NextFunction) => {
  try {
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
  } catch (err) { next(err) }
}

export const deleteBookChapter = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const bookId = req.params.bookId as string
    const id = req.params.id as string
    const book = await prisma.book.findFirst({ where: { id: bookId, userId: req.userId } })
    if (!book) return res.status(404).json({ error: 'Book not found' })
    await prisma.bookChapter.delete({ where: { id } })
    res.json({ success: true })
  } catch (err) { next(err) }
}

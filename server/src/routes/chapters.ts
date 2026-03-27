import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import * as books from '../controllers/books.js'

export const chapterRouter = Router({ mergeParams: true })

chapterRouter.get('/', requireAuth, books.listBookChapters)
chapterRouter.post('/', requireAuth, books.createBookChapter)
chapterRouter.patch('/reorder', requireAuth, books.reorderBookChapters)
chapterRouter.get('/:id', requireAuth, books.getBookChapter)
chapterRouter.patch('/:id', requireAuth, books.updateBookChapter)
chapterRouter.delete('/:id', requireAuth, books.deleteBookChapter)

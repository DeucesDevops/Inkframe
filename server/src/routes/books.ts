import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import * as books from '../controllers/books.js'

export const bookRouter = Router()

bookRouter.get('/', requireAuth, books.listBooks)
bookRouter.post('/', requireAuth, books.createBook)
bookRouter.get('/:id', requireAuth, books.getBook)
bookRouter.patch('/:id', requireAuth, books.updateBook)
bookRouter.delete('/:id', requireAuth, books.deleteBook)

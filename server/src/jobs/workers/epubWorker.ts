import { Worker } from 'bullmq'
import { Redis } from 'ioredis'
import prisma from '../../db/client.js'
import { generateEpub } from '../../lib/epub.js'
import { uploadToS3 } from '../../lib/s3.js'

const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
})

// @ts-ignore
new Worker('export-epub', async (job) => {
  const { bookId, exportId } = job.data

  await prisma.export.update({ where: { id: exportId }, data: { status: 'PROCESSING' } })

  const book = await prisma.book.findUnique({
    where: { id: bookId },
    include: { chapters: { orderBy: { order: 'asc' } }, user: true },
  })

  if (!book) throw new Error('Book not found')

  const epubBuffer = await generateEpub({
    title: book.title,
    author: (book.user as any).name || 'Unknown Author',
    description: book.description || '',
    chapters: book.chapters.map(ch => ({
      title: ch.title,
      content: ch.content,
      order: ch.order,
    })),
  })

  const safeTitle = book.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()
  const s3Key = `exports/${bookId}/${safeTitle}.epub`

  await uploadToS3(s3Key, epubBuffer, 'application/epub+zip')
  await prisma.export.update({
    where: { id: exportId },
    data: { status: 'DONE', s3Key },
  })
}, { connection: connection as any })

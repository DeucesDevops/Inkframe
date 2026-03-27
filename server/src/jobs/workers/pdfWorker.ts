import { Worker } from 'bullmq'
import { Redis } from 'ioredis'
import prisma from '../../db/client.js'
import { generatePdf } from '../../lib/pdf.js'
import { uploadToS3 } from '../../lib/s3.js'

const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
})

// @ts-ignore
new Worker('export-pdf', async (job) => {
  const { bookId, exportId, pdfType } = job.data as { bookId: string; exportId: string; pdfType: 'digital' | 'print' }

  await prisma.export.update({ where: { id: exportId }, data: { status: 'PROCESSING' } })

  const book = await prisma.book.findUnique({
    where: { id: bookId },
    include: { chapters: { orderBy: { order: 'asc' } }, user: true },
  })

  if (!book) throw new Error('Book not found')

  const pdfBuffer = await generatePdf({
    title: book.title,
    author: (book.user as any).name || 'Unknown Author',
    chapters: book.chapters.map(ch => ({
      title: ch.title,
      content: ch.content,
      order: ch.order,
    })),
  }, pdfType)

  const safeTitle = book.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()
  const suffix = pdfType === 'print' ? '-print' : '-digital'
  const s3Key = `exports/${bookId}/${safeTitle}${suffix}.pdf`

  await uploadToS3(s3Key, pdfBuffer, 'application/pdf')
  await prisma.export.update({
    where: { id: exportId },
    data: { status: 'DONE', s3Key },
  })
}, { connection: connection as any })

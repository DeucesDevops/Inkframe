import { Worker } from 'bullmq'
import { Redis } from 'ioredis'
import prisma from '../../db/client.js'
import { textToSpeech } from '../../lib/tts.js'
import { uploadToS3 } from '../../lib/s3.js'
import { stripHtml } from '../../lib/htmlUtils.js'

const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
})

// @ts-ignore
new Worker('generate-audio', async (job) => {
  const { bookId, audioFileId, chapterId, voice } = job.data

  await prisma.audioFile.update({ where: { id: audioFileId }, data: { status: 'PROCESSING' } })

  const book = await prisma.book.findUnique({
    where: { id: bookId },
    include: {
      chapters: chapterId
        ? { where: { id: chapterId } }
        : { orderBy: { order: 'asc' } },
    },
  })

  if (!book || book.chapters.length === 0) throw new Error('No chapters found')

  const audioChunks: Buffer[] = []
  for (const chapter of book.chapters) {
    const plainText = stripHtml(chapter.content)
    if (!plainText.trim()) continue
    const buf = await textToSpeech(plainText, voice)
    audioChunks.push(buf)
  }

  const combined = Buffer.concat(audioChunks)
  const safeTitle = book.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()
  const s3Key = `audio/${bookId}/${safeTitle}.mp3`

  await uploadToS3(s3Key, combined, 'audio/mpeg')
  await prisma.audioFile.update({
    where: { id: audioFileId },
    data: { status: 'DONE', s3Key },
  })
}, { connection: connection as any })

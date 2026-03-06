import { Worker } from 'bullmq'
import { Redis } from 'ioredis'
import { prisma } from '../../db/client.js'
import { splitIntoChunks, extractKeywords } from '../../lib/chunker.js'

const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null
})

export const ingestionWorker = new Worker('resource-ingestion', async (job) => {
    const { projectId, fileName, fileBuffer, mimeType } = job.data
    await job.updateProgress(10)

    // Extract text based on file type
    let text = ''
    if (mimeType === 'text/plain' || mimeType === 'text/markdown' || mimeType === 'application/octet-stream') {
        // Buffer passed from job data needs to be converted back if it was serialized
        const buffer = Buffer.from(fileBuffer)
        text = buffer.toString('utf-8')
    } else {
        // Placeholder for PDF/DOCX extraction
        text = "Unsupported file type for now. Text extraction failed."
    }

    await job.updateProgress(30)

    // Chunk the text
    const rawChunks = splitIntoChunks(text, 400)
    await job.updateProgress(60)

    // Save chunks to database
    const chunks = rawChunks.map((chunkText) => ({
        projectId,
        source: fileName,
        theme: extractKeywords(chunkText).slice(0, 2).join(' '),
        keywords: extractKeywords(chunkText),
        text: chunkText
    }))

    await prisma.resourceChunk.createMany({ data: chunks })
    await job.updateProgress(100)

    return { chunksCreated: chunks.length, wordCount: text.split(' ').length }
}, { connection: connection as any })

console.log('Ingestion worker started')

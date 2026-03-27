import { Worker } from 'bullmq'
import { Redis } from 'ioredis'
import { prisma } from '../../db/client.js'
import { splitIntoChunks, extractKeywords } from '../../lib/chunker.js'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const pdf = require('pdf-parse')
const mammoth = require('mammoth')

const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null
})

export const ingestionWorker = new Worker('resource-ingestion', async (job) => {
    const { projectId, fileName, fileBuffer, mimeType } = job.data
    await job.updateProgress(10)

    // Extract text based on file type
    let text = ""
    const buffer = Buffer.from(fileBuffer)

    try {
        if (mimeType === 'text/plain' || mimeType === 'text/markdown' || mimeType === 'application/octet-stream') {
            text = buffer.toString('utf-8')
        } else if (mimeType === 'application/pdf') {
            const data = await pdf(buffer)
            text = data.text
        } else if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
            const result = await mammoth.extractRawText({ buffer })
            text = result.value
        } else {
            text = "Unsupported file type: " + mimeType
        }
    } catch (err: any) {
        console.error(`Extraction failed for ${fileName}:`, err)
        text = `Extraction failed: ${err.message}`
    }

    await job.updateProgress(30)
    if (!text || text.length < 10) {
        return { error: 'Insufficient text extracted', textLength: text?.length }
    }

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

    return { chunksCreated: chunks.length, wordCount: text.split(/\s+/).length }
}, { connection: connection as any })

console.log('Ingestion worker started')

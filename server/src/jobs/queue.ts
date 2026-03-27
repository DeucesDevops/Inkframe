import { Queue } from 'bullmq'
import { Redis } from 'ioredis'

const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
})

// @ts-ignore
export const ingestionQueue = new Queue('resource-ingestion', { connection: connection as any })
// @ts-ignore
export const exportQueue = new Queue('export', { connection: connection as any })
// @ts-ignore
export const repurposeQueue = new Queue('repurpose', { connection: connection as any })
// @ts-ignore
export const epubQueue = new Queue('export-epub', { connection: connection as any })
// @ts-ignore
export const pdfQueue = new Queue('export-pdf', { connection: connection as any })
// @ts-ignore
export const audioQueue = new Queue('generate-audio', { connection: connection as any })

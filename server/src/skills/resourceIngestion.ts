import { Request, Response, NextFunction } from 'express'
import { ingestionQueue } from '../jobs/queue.js'
import { prisma } from '../db/client.js'

export async function run(req: Request, res: Response, next: NextFunction) {
    try {
        const { projectId } = req.body
        const files = req.files as Express.Multer.File[]

        if (!files || files.length === 0) {
            return res.status(400).json({ error: 'No files uploaded' })
        }

        const project = await prisma.project.findFirst({
            where: { id: projectId, userId: req.userId }
        })

        if (!project) return res.status(404).json({ error: 'Project not found' })

        const jobs = files.map(file => ({
            name: 'resource-ingestion',
            data: {
                projectId,
                fileName: file.originalname,
                fileBuffer: file.buffer,
                mimeType: file.mimetype
            }
        }))

        await ingestionQueue.addBulk(jobs)

        // Update checkpoint
        await prisma.project.update({
            where: { id: projectId },
            data: {
                checkpoints: {
                    ...(project.checkpoints as object),
                    resources_ingested: 'in_progress'
                }
            }
        })

        res.json({ message: 'Files queued for ingestion', count: files.length })
    } catch (err) { next(err) }
}

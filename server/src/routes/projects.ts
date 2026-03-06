import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { prisma } from '../db/client.js'
import { z } from 'zod'

const router = Router()
router.use(requireAuth)

// List all projects for the user
router.get('/', async (req, res, next) => {
    try {
        const projects = await prisma.project.findMany({
            where: { userId: req.userId },
            select: {
                id: true, title: true, subtitle: true, status: true,
                wordTarget: true, wordCurrent: true, checkpoints: true,
                createdAt: true, updatedAt: true,
                _count: { select: { chapters: true } }
            },
            orderBy: { updatedAt: 'desc' }
        })
        res.json(projects)
    } catch (err) { next(err) }
})

// Create new project
router.post('/', async (req, res, next) => {
    try {
        const { title, niche, genre, wordTarget } = req.body

        // Check monthly book limit
        const user = await prisma.user.findUnique({ where: { id: req.userId } })
        const limits = { STARTER: 1, PROFESSIONAL: 3, STUDIO: 10 }

        if (!user) return res.status(404).json({ error: 'User not found' })

        if (user.booksThisMonth >= (limits[user.plan as keyof typeof limits] || 1)) {
            return res.status(403).json({ error: 'Monthly book limit reached for your plan' })
        }

        const project = await prisma.project.create({
            data: {
                userId: req.userId,
                title: title || 'Untitled Book',
                niche: niche || '',
                genre: genre || 'nonfiction',
                wordTarget: wordTarget || 50000,
                checkpoints: {
                    market_analysis: 'not_started',
                    title_selected: 'not_started',
                    reader_persona: 'not_started',
                    resources_ingested: 'not_started',
                    author_persona: 'not_started',
                    outline_approved: 'not_started',
                    chapters_written: 'not_started',
                    quality_reviewed: 'not_started',
                    exported: 'not_started'
                }
            }
        })

        // Increment user's book count
        await prisma.user.update({
            where: { id: req.userId },
            data: { booksThisMonth: { increment: 1 } }
        })

        res.status(201).json(project)
    } catch (err) { next(err) }
})

// Get single project with full context
router.get('/:id', async (req, res, next) => {
    try {
        const project = await prisma.project.findFirst({
            where: { id: req.params.id, userId: req.userId },
            include: {
                chapters: { orderBy: { chapterNumber: 'asc' } },
                _count: { select: { resources: true } }
            }
        })
        if (!project) return res.status(404).json({ error: 'Project not found' })
        res.json(project)
    } catch (err) { next(err) }
})

// Update project (title, context fields, checkpoints)
router.patch('/:id', async (req, res, next) => {
    try {
        const project = await prisma.project.findFirst({
            where: { id: req.params.id, userId: req.userId }
        })
        if (!project) return res.status(404).json({ error: 'Project not found' })

        const updated = await prisma.project.update({
            where: { id: req.params.id },
            data: { ...req.body, updatedAt: new Date() }
        })
        res.json(updated)
    } catch (err) { next(err) }
})

// Delete project
router.delete('/:id', async (req, res, next) => {
    try {
        await prisma.project.deleteMany({
            where: { id: req.params.id, userId: req.userId }
        })
        res.json({ success: true })
    } catch (err) { next(err) }
})

// Chapter routes
router.get('/:id/chapters', async (req, res, next) => {
    try {
        const chapters = await prisma.chapter.findMany({
            where: { projectId: req.params.id, project: { userId: req.userId } },
            orderBy: { chapterNumber: 'asc' }
        })
        res.json(chapters)
    } catch (err) { next(err) }
})

router.patch('/:id/chapters/:chapterNum', async (req, res, next) => {
    try {
        const chapter = await prisma.chapter.update({
            where: {
                projectId_chapterNumber: {
                    projectId: req.params.id,
                    chapterNumber: parseInt(req.params.chapterNum)
                }
            },
            data: { ...req.body, updatedAt: new Date() }
        })
        res.json(chapter)
    } catch (err) { next(err) }
})

export { router as projectRouter }

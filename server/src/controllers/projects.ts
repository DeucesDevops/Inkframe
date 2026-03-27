import { Request, Response, NextFunction } from 'express'
import { prisma } from '../db/client.js'

export const listProjects = async (req: Request, res: Response, next: NextFunction) => {
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
}

export const createProject = async (req: Request, res: Response, next: NextFunction) => {
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
                } as any
            }
        })

        // Increment user's book count
        await prisma.user.update({
            where: { id: req.userId },
            data: { booksThisMonth: { increment: 1 } }
        })

        res.status(201).json(project)
    } catch (err) { next(err) }
}

export const getProject = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const project = await prisma.project.findFirst({
            where: { id: req.params.id as string, userId: req.userId as string },
            include: {
                chapters: { orderBy: { chapterNumber: 'asc' } },
                _count: { select: { resources: true } }
            }
        })
        if (!project) return res.status(404).json({ error: 'Project not found' })
        res.json(project)
    } catch (err) { next(err) }
}

export const updateProject = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const project = await prisma.project.findFirst({
            where: { id: req.params.id as string, userId: req.userId as string }
        })
        if (!project) return res.status(404).json({ error: 'Project not found' })

        const updated = await prisma.project.update({
            where: { id: req.params.id as string },
            data: { ...req.body, updatedAt: new Date() }
        })
        res.json(updated)
    } catch (err) { next(err) }
}

export const deleteProject = async (req: Request, res: Response, next: NextFunction) => {
    try {
        await prisma.project.deleteMany({
            where: { id: req.params.id as string, userId: req.userId as string }
        })
        res.json({ success: true })
    } catch (err) { next(err) }
}

export const listChapters = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const chapters = await prisma.chapter.findMany({
            where: { projectId: req.params.id as string, project: { userId: req.userId as string } },
            orderBy: { chapterNumber: 'asc' }
        })
        res.json(chapters)
    } catch (err) { next(err) }
}

export const updateChapter = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const chapter = await prisma.chapter.update({
            where: {
                projectId_chapterNumber: {
                    projectId: req.params.id as string,
                    chapterNumber: parseInt(req.params.chapterNum as string)
                }
            },
            data: { ...req.body, updatedAt: new Date() }
        })
        res.json(chapter)
    } catch (err) { next(err) }
}

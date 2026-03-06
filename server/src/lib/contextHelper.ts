import { prisma } from '../db/client.js'

export async function getProjectContext(projectId: string, userId: string) {
    const project = await prisma.project.findFirst({
        where: { id: projectId, userId }, // userId scoping — critical security check
        include: { chapters: true, resources: true }
    })
    if (!project) throw new Error('Project not found')
    return project
}

export async function updateContext(projectId: string, updates: Record<string, any>) {
    const project = await prisma.project.findUnique({ where: { id: projectId } })
    const currentContext = (project?.context as Record<string, any>) || {}
    const merged = { ...currentContext, ...updates, updatedAt: new Date().toISOString() }
    return prisma.project.update({
        where: { id: projectId },
        data: { context: merged, updatedAt: new Date() }
    })
}

export async function updateCheckpoint(projectId: string, checkpoint: string, value: string) {
    const project = await prisma.project.findUnique({ where: { id: projectId } })
    const checkpoints = (project?.checkpoints as Record<string, string>) || {}
    checkpoints[checkpoint] = value
    return prisma.project.update({
        where: { id: projectId },
        data: { checkpoints }
    })
}

export async function getRelevantChunks(projectId: string, keywords: string[], topN = 5) {
    const chunks = await prisma.resourceChunk.findMany({ where: { projectId } })
    // Score chunks by keyword overlap
    const scored = chunks.map(chunk => {
        const chunkKeywords = (chunk.keywords as string[]) || []
        const overlap = keywords.filter(kw =>
            chunkKeywords.some(ck => ck.toLowerCase().includes(kw.toLowerCase()))
        ).length
        return { chunk, score: overlap / Math.max(keywords.length, 1) }
    })

    return scored
        .filter(s => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, topN)
        .map(s => s.chunk)
}

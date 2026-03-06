import { Request, Response, NextFunction } from 'express'
import { prisma } from '../db/client.js'

const PLAN_LIMITS = {
    STARTER: { booksPerMonth: 1, qualityLayer: false, inlineAgents: false },
    PROFESSIONAL: { booksPerMonth: 3, qualityLayer: true, inlineAgents: true },
    STUDIO: { booksPerMonth: 10, qualityLayer: true, inlineAgents: true }
}

export function requirePlan(...requiredFeatures: string[]) {
    return async (req: Request, res: Response, next: NextFunction) => {
        const user = await prisma.user.findUnique({ where: { id: req.userId } })
        if (!user) return res.status(401).json({ error: 'User not found' })

        const limits = PLAN_LIMITS[user.plan as keyof typeof PLAN_LIMITS]
        for (const feature of requiredFeatures) {
            if (!limits[feature as keyof typeof limits]) {
                return res.status(403).json({
                    error: 'Plan upgrade required',
                    feature,
                    currentPlan: user.plan,
                    upgradeUrl: '/settings/billing'
                })
            }
        }
        next()
    }
}

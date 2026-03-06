import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { prisma } from '../db/client.js'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

const signupSchema = z.object({
    email: z.string().email(),
    password: z.string().min(8)
})

router.post('/signup', async (req, res, next) => {
    try {
        const { email, password } = signupSchema.parse(req.body)
        const existing = await prisma.user.findUnique({ where: { email } })
        if (existing) return res.status(409).json({ error: 'Email already in use' })

        const passwordHash = await bcrypt.hash(password, 12)
        const user = await prisma.user.create({
            data: { email, passwordHash },
            select: { id: true, email: true, plan: true }
        })

        const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, { expiresIn: '7d' })
        res.json({ user, token })
    } catch (err) { next(err) }
})

router.post('/login', async (req, res, next) => {
    try {
        const { email, password } = signupSchema.parse(req.body)
        const user = await prisma.user.findUnique({ where: { email } })
        if (!user) return res.status(401).json({ error: 'Invalid credentials' })

        const valid = await bcrypt.compare(password, user.passwordHash)
        if (!valid) return res.status(401).json({ error: 'Invalid credentials' })

        const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, { expiresIn: '7d' })
        res.json({
            user: { id: user.id, email: user.email, plan: user.plan },
            token
        })
    } catch (err) { next(err) }
})

router.get('/me', requireAuth, async (req, res) => {
    const user = await prisma.user.findUnique({
        where: { id: req.userId },
        select: { id: true, email: true, plan: true, booksThisMonth: true }
    })
    res.json(user)
})

export { router as authRouter }

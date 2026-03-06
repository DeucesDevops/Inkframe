import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { authRouter } from './routes/auth.js'
import { projectRouter } from './routes/projects.js'
import { skillRouter } from './routes/skills.js'
import { errorHandler } from './middleware/errorHandler.js'
import './jobs/workers/ingestionWorker.js'

const app = express()

app.use(helmet())
app.use(cors({
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    credentials: true
}))
app.use(express.json({ limit: '10mb' }))

// Routes
app.use('/api/auth', authRouter)
app.use('/api/projects', projectRouter)
app.use('/api/skills', skillRouter)

// Error Handler
app.use(errorHandler)

const PORT = process.env.PORT || 4000
if (process.env.NODE_ENV !== 'test') {
    app.listen(PORT, () => console.log(`Inkframe API running on port ${PORT}`))
}

export default app

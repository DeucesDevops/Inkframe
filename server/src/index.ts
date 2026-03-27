import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import client from 'prom-client'
import { authRouter } from './routes/auth.js'
import { projectRouter } from './routes/projects.js'
import { skillRouter } from './routes/skills.js'
import { bookRouter } from './routes/books.js'
import { chapterRouter } from './routes/chapters.js'
import { aiRouter } from './routes/ai.js'
import { exportRouter } from './routes/export.js'
import { audioRouter } from './routes/audio.js'
import { publishRouter } from './routes/publish.js'
import { filesRouter } from './routes/files.js'
import { errorHandler } from './middleware/errorHandler.js'
import './jobs/workers/ingestionWorker.js'
import './jobs/workers/epubWorker.js'
import './jobs/workers/pdfWorker.js'
import './jobs/workers/audioWorker.js'

// ── Prometheus setup ─────────────────────────────────────────────────────────
// Collect built-in Node.js metrics: event loop lag, heap, GC, active handles, etc.
// Prefix "inkframe_" so metrics are easy to filter in Grafana.
const register = new client.Registry()
client.collectDefaultMetrics({ register, prefix: 'inkframe_' })

// HTTP request duration histogram — latency per route and status code
const httpRequestDuration = new client.Histogram({
    name: 'inkframe_http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
    registers: [register],
})

const app = express()

// Instrument every request before any other middleware
app.use((req, res, next) => {
    const end = httpRequestDuration.startTimer()
    res.on('finish', () => {
        end({
            method: req.method,
            route: req.route?.path ?? req.path,
            status_code: res.statusCode,
        })
    })
    next()
})

app.use(helmet())
app.use(cors({
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    credentials: true
}))
app.use(express.json({ limit: '10mb' }))

// ── Health check ─────────────────────────────────────────────────────────────
// Used by K8s readiness and liveness probes (server-deployment.yaml).
// Returns 200 immediately — does not ping the DB to avoid probe cascades.
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// ── Prometheus metrics ───────────────────────────────────────────────────────
// Scraped by Prometheus every 15s from inside the cluster.
// Not exposed via the public ALB ingress.
app.get('/metrics', async (_req, res) => {
    res.set('Content-Type', register.contentType)
    res.end(await register.metrics())
})

// ── API routes ───────────────────────────────────────────────────────────────
app.use('/api/auth', authRouter)
app.use('/api/projects', projectRouter)
app.use('/api/skills', skillRouter)
app.use('/api/books', bookRouter)
app.use('/api/books/:bookId/chapters', chapterRouter)
app.use('/api/ai', aiRouter)
app.use('/api/export', exportRouter)
app.use('/api/audio', audioRouter)
app.use('/api/publish', publishRouter)
app.use('/api/files', filesRouter)

// Error Handler
app.use(errorHandler)

const PORT = process.env.PORT || 4000
if (process.env.NODE_ENV !== 'test') {
    app.listen(PORT, () => console.log(`Inkframe API running on port ${PORT}`))
}

export default app

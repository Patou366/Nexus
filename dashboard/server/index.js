import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, resolve, join } from 'path'
import { existsSync } from 'fs'
import guildsRouter from './routes/guilds.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '../../.env') })

const app = express()
const PORT = process.env.PORT || process.env.DASHBOARD_API_PORT || 3001

if (!process.env.DATABASE_PUBLIC_URL && !process.env.DATABASE_URL && !process.env.PGHOST) {
  console.warn('⚠️  WARNING: No database credentials found. Set DATABASE_PUBLIC_URL in Replit Secrets.')
}
if (!process.env.BOT_INTERNAL_URL) {
  console.warn('⚠️  WARNING: BOT_INTERNAL_URL not set. Bot config-sync notifications will fail.')
}

app.use(cors({ origin: '*' }))
app.use(express.json())

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.use('/api/guilds', guildsRouter)

app.use((err, _req, res, _next) => {
  console.error('API error:', err.message)
  res.status(500).json({ error: err.message || 'Internal server error' })
})

const distPath = resolve(__dirname, '../dist')
if (existsSync(distPath)) {
  app.use(express.static(distPath))
  app.get('*', (_req, res) => {
    res.sendFile(join(distPath, 'index.html'))
  })
}

app.listen(PORT, '0.0.0.0', () => {
  const mode = existsSync(distPath) ? 'production' : 'development (API only)'
  console.log(`Dashboard API running on port ${PORT} [${mode}]`)
})

import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import guildsRouter from './routes/guilds.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '../../.env') })

const app = express()
const PORT = process.env.DASHBOARD_API_PORT || 3001

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

app.listen(PORT, 'localhost', () => {
  console.log(`Dashboard API running on http://localhost:${PORT}`)
})

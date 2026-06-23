import pg from 'pg'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '../../.env') })

const { Pool } = pg

const RAILWAY_PUBLIC_HOST = 'postgres-production-0b22.up.railway.app'

function buildConfig() {
  const privateUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL

  if (privateUrl) {
    try {
      const u = new URL(privateUrl)
      const host = RAILWAY_PUBLIC_HOST
      const port = parseInt(u.port || '5432', 10)
      const database = u.pathname.replace(/^\//, '')
      const user = decodeURIComponent(u.username)
      const password = decodeURIComponent(u.password)

      console.log(`🗄️  DB: ${host}:${port}/${database} (user: ${user})`)
      return { host, port, database, user, password, ssl: { rejectUnauthorized: false } }
    } catch (e) {
      console.warn('⚠️  Could not parse POSTGRES_URL:', e.message)
    }
  }

  const explicitUrl = process.env.DASHBOARD_DB_URL || process.env.POSTGRES_PUBLIC_URL || process.env.DATABASE_PUBLIC_URL
  if (explicitUrl) {
    try { console.log(`🗄️  DB (url): ${new URL(explicitUrl).host}`) } catch {}
    return { connectionString: explicitUrl, ssl: { rejectUnauthorized: false } }
  }

  console.warn('⚠️  No database credentials found. Set POSTGRES_URL in Replit Secrets.')
  return {}
}

const pool = new Pool({
  ...buildConfig(),
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
})

pool.on('error', (err) => {
  console.error('Unexpected DB pool error:', err.message)
})

export default pool

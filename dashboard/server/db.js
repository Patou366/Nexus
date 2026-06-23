import pg from 'pg'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '../../.env') })

const { Pool } = pg

function buildConfig() {
  const host = process.env.POSTGRES_HOST
  const port = parseInt(process.env.POSTGRES_PORT || '5432', 10)
  const database = process.env.POSTGRES_DB
  const user = process.env.POSTGRES_USER
  const password = process.env.POSTGRES_PASSWORD

  if (host && database && user && password) {
    const ssl = !host.includes('localhost') && !host.includes('127.0.0.1')
      ? { rejectUnauthorized: false }
      : false
    console.log(`🗄️  DB: ${host}:${port}/${database}`)
    return { host, port, database, user, password, ssl }
  }

  const urlCandidates = [
    process.env.DASHBOARD_DB_URL,
    process.env.POSTGRES_PUBLIC_URL,
    process.env.DATABASE_PUBLIC_URL,
    process.env.POSTGRES_URL,
    process.env.DATABASE_URL,
  ].filter(u => u && !u.includes('railway.internal'))

  const connectionString = urlCandidates[0]

  if (connectionString) {
    const needsSsl =
      connectionString.includes('rlwy.net') ||
      connectionString.includes('railway.app') ||
      connectionString.includes('supabase') ||
      connectionString.includes('neon.tech') ||
      connectionString.includes('amazonaws') ||
      connectionString.includes('render.com')

    try { console.log(`🗄️  DB: ${new URL(connectionString).host}`) } catch {}
    return {
      connectionString,
      ssl: needsSsl ? { rejectUnauthorized: false } : false,
    }
  }

  console.warn('⚠️  No reachable database config found. Set POSTGRES_HOST / POSTGRES_URL in Replit Secrets.')
  return {}
}

const pool = new Pool({
  ...buildConfig(),
  max: parseInt(process.env.POSTGRES_MAX_CONNECTIONS || '10', 10),
  idleTimeoutMillis: parseInt(process.env.POSTGRES_IDLE_TIMEOUT || '30000', 10),
  connectionTimeoutMillis: parseInt(process.env.POSTGRES_CONNECTION_TIMEOUT || '10000', 10),
})

pool.on('error', (err) => {
  console.error('Unexpected DB pool error:', err.message)
})

export default pool

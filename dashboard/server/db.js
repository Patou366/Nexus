import pg from 'pg'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '../../.env') })

const { Pool } = pg

const connectionString =
  process.env.DASHBOARD_DB_URL ||
  process.env.POSTGRES_PUBLIC_URL ||
  process.env.DATABASE_PUBLIC_URL ||
  (() => {
    const candidates = [process.env.POSTGRES_URL, process.env.DATABASE_URL]
    return candidates.find(u => u && !u.includes('railway.internal'))
  })()

if (!connectionString) {
  console.warn('⚠️  No reachable DB URL found. Add DASHBOARD_DB_URL to Replit Secrets (use your Railway public URL).')
} else {
  try {
    console.log(`🗄️  DB: ${new URL(connectionString).host}`)
  } catch {
    console.log('🗄️  DB: configured')
  }
}

const needsSsl = connectionString &&
  (connectionString.includes('rlwy.net') ||
   connectionString.includes('railway.app') ||
   connectionString.includes('supabase') ||
   connectionString.includes('neon.tech') ||
   connectionString.includes('amazonaws') ||
   connectionString.includes('render.com'))

const poolConfig = {
  ssl: needsSsl ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
}

if (connectionString) {
  poolConfig.connectionString = connectionString
}

const pool = new Pool(poolConfig)

pool.on('error', (err) => {
  console.error('Unexpected DB pool error:', err.message)
})

export default pool

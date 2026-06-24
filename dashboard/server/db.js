import pg from 'pg'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '../../.env') })

const { Pool } = pg

const PUBLIC_PORT = 5432

function buildConfig() {
  const publicUrl = process.env.DATABASE_PUBLIC_URL
  if (publicUrl) {
    try {
      const u = new URL(publicUrl)
      const config = {
        host: u.hostname,
        port: parseInt(u.port || String(PUBLIC_PORT), 10),
        database: u.pathname.replace(/^\//, ''),
        user: decodeURIComponent(u.username),
        password: decodeURIComponent(u.password),
        ssl: { rejectUnauthorized: false },
      }
      console.log(`🗄️  DB: ${config.host}:${config.port}/${config.database} (user: ${config.user})`)
      return config
    } catch (e) {
      console.warn('⚠️  Could not parse DATABASE_PUBLIC_URL:', e.message)
    }
  }

  const internalUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL
  if (internalUrl) {
    try {
      const u = new URL(internalUrl)
      const config = {
        host: u.hostname,
        port: parseInt(u.port || '5432', 10),
        database: u.pathname.replace(/^\//, ''),
        user: decodeURIComponent(u.username),
        password: decodeURIComponent(u.password),
        ssl: { rejectUnauthorized: false },
      }
      console.log(`🗄️  DB (internal): ${config.host}:${config.port}/${config.database}`)
      return config
    } catch (e) {
      console.warn('⚠️  Could not parse DATABASE_URL:', e.message)
    }
  }

  const pgHost = process.env.PGHOST
  const pgUser = process.env.PGUSER
  const pgPassword = process.env.PGPASSWORD
  const pgDatabase = process.env.PGDATABASE
  const pgPort = process.env.PGPORT

  if (pgHost && pgUser && pgDatabase) {
    const config = {
      host: pgHost,
      port: parseInt(pgPort || String(PUBLIC_PORT), 10),
      database: pgDatabase,
      user: pgUser,
      password: pgPassword,
      ssl: { rejectUnauthorized: false },
    }
    console.log(`🗄️  DB (pg env): ${config.host}:${config.port}/${config.database}`)
    return config
  }

  console.warn('⚠️  No database credentials found. Set DATABASE_PUBLIC_URL in Replit Secrets.')
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

import { Router } from 'express'
import pool from '../db.js'

const router = Router()

const BOT_INTERNAL_URL = process.env.BOT_INTERNAL_URL || 'http://localhost:3000'

async function notifyBot(path, body = {}) {
  try {
    const res = await fetch(`${BOT_INTERNAL_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) console.warn(`Bot notify ${path} responded ${res.status}`)
  } catch (err) {
    console.warn(`Bot notify ${path} failed (bot may not be running):`, err.message)
  }
}

async function ensureGuild(guildId) {
  await pool.query(
    `INSERT INTO guilds (id, config) VALUES ($1, '{}') ON CONFLICT (id) DO NOTHING`,
    [guildId]
  )
}

async function ensureWelcome(guildId) {
  await pool.query(
    `INSERT INTO welcome_configs (guild_id, config) VALUES ($1, '{}') ON CONFLICT (guild_id) DO NOTHING`,
    [guildId]
  )
}

router.get('/', async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, config, counters, created_at, updated_at FROM guilds ORDER BY created_at DESC`
    )
    res.json(result.rows)
  } catch (err) {
    console.error('DB error listing guilds:', err.message)
    res.status(503).json({ error: 'Database unavailable', detail: err.message })
  }
})

router.get('/:guildId/config', async (req, res, next) => {
  try {
    const { guildId } = req.params
    const result = await pool.query(`SELECT config FROM guilds WHERE id = $1`, [guildId])
    if (result.rows.length === 0) return res.json({})
    res.json(result.rows[0].config || {})
  } catch (err) {
    next(err)
  }
})

router.put('/:guildId/config', async (req, res, next) => {
  try {
    const { guildId } = req.params
    const patch = req.body
    await ensureGuild(guildId)
    const result = await pool.query(
      `UPDATE guilds
       SET config = config || $2::jsonb, updated_at = NOW()
       WHERE id = $1
       RETURNING config`,
      [guildId, JSON.stringify(patch)]
    )
    // Push changes to the live bot
    notifyBot('/api/internal/config-update', { guildId, config: patch })
    res.json(result.rows[0].config)
  } catch (err) {
    next(err)
  }
})

router.get('/:guildId/welcome', async (req, res, next) => {
  try {
    const { guildId } = req.params
    const result = await pool.query(`SELECT config FROM welcome_configs WHERE guild_id = $1`, [guildId])
    if (result.rows.length === 0) return res.json({})
    res.json(result.rows[0].config || {})
  } catch (err) {
    next(err)
  }
})

router.put('/:guildId/welcome', async (req, res, next) => {
  try {
    const { guildId } = req.params
    const patch = req.body
    await ensureWelcome(guildId)
    const result = await pool.query(
      `UPDATE welcome_configs
       SET config = config || $2::jsonb, updated_at = NOW()
       WHERE guild_id = $1
       RETURNING config`,
      [guildId, JSON.stringify(patch)]
    )
    notifyBot('/api/internal/config-update', { guildId, config: { welcome: patch } })
    res.json(result.rows[0].config)
  } catch (err) {
    next(err)
  }
})

router.get('/:guildId/leveling', async (req, res, next) => {
  try {
    const { guildId } = req.params
    const result = await pool.query(`SELECT config->'leveling' AS leveling FROM guilds WHERE id = $1`, [guildId])
    if (result.rows.length === 0) return res.json({})
    res.json(result.rows[0].leveling || {})
  } catch (err) {
    next(err)
  }
})

router.put('/:guildId/leveling', async (req, res, next) => {
  try {
    const { guildId } = req.params
    const patch = req.body
    await ensureGuild(guildId)
    const existing = await pool.query(`SELECT config->'leveling' AS leveling FROM guilds WHERE id = $1`, [guildId])
    const current = existing.rows[0]?.leveling || {}
    const merged = { ...current, ...patch }
    const result = await pool.query(
      `UPDATE guilds
       SET config = jsonb_set(config, '{leveling}', $2::jsonb), updated_at = NOW()
       WHERE id = $1
       RETURNING config->'leveling' AS leveling`,
      [guildId, JSON.stringify(merged)]
    )
    notifyBot('/api/internal/config-update', { guildId, config: { leveling: merged } })
    res.json(result.rows[0].leveling)
  } catch (err) {
    next(err)
  }
})

router.get('/:guildId/joinToCreate', async (req, res, next) => {
  try {
    const { guildId } = req.params
    const key = `guild:${guildId}:jointocreate`
    const result = await pool.query(
      `SELECT value FROM temp_data WHERE key = $1 AND (expires_at IS NULL OR expires_at > NOW())`,
      [key]
    )
    res.json(result.rows.length > 0 ? result.rows[0].value : {})
  } catch (err) {
    next(err)
  }
})

router.put('/:guildId/joinToCreate', async (req, res, next) => {
  try {
    const { guildId } = req.params
    const key = `guild:${guildId}:jointocreate`
    const patch = req.body
    const existing = await pool.query(
      `SELECT value FROM temp_data WHERE key = $1 AND (expires_at IS NULL OR expires_at > NOW())`,
      [key]
    )
    const current = existing.rows.length > 0 ? existing.rows[0].value : {}
    const merged = { ...current, ...patch }
    await pool.query(
      `INSERT INTO temp_data (key, value) VALUES ($1, $2::jsonb)
       ON CONFLICT (key) DO UPDATE SET value = $2::jsonb, expires_at = NULL`,
      [key, JSON.stringify(merged)]
    )
    res.json(merged)
  } catch (err) {
    next(err)
  }
})

router.get('/:guildId/applications', async (req, res, next) => {
  try {
    const { guildId } = req.params
    const key = `guild:${guildId}:applications:settings`
    const result = await pool.query(
      `SELECT value FROM temp_data WHERE key = $1 AND (expires_at IS NULL OR expires_at > NOW())`,
      [key]
    )
    res.json(result.rows.length > 0 ? result.rows[0].value : {})
  } catch (err) {
    next(err)
  }
})

router.put('/:guildId/applications', async (req, res, next) => {
  try {
    const { guildId } = req.params
    const key = `guild:${guildId}:applications:settings`
    const patch = req.body
    const existing = await pool.query(
      `SELECT value FROM temp_data WHERE key = $1 AND (expires_at IS NULL OR expires_at > NOW())`,
      [key]
    )
    const current = existing.rows.length > 0 ? existing.rows[0].value : {}
    const merged = { ...current, ...patch }
    await pool.query(
      `INSERT INTO temp_data (key, value) VALUES ($1, $2::jsonb)
       ON CONFLICT (key) DO UPDATE SET value = $2::jsonb, expires_at = NULL`,
      [key, JSON.stringify(merged)]
    )
    res.json(merged)
  } catch (err) {
    next(err)
  }
})

export default router

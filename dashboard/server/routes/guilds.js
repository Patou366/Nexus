import { Router } from 'express'
import pool from '../db.js'

const router = Router()

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

async function ensureLeveling(guildId) {
  await pool.query(
    `INSERT INTO leveling_configs (guild_id, config) VALUES ($1, '{}') ON CONFLICT (guild_id) DO NOTHING`,
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
    res.json(result.rows[0].config)
  } catch (err) {
    next(err)
  }
})

router.get('/:guildId/leveling', async (req, res, next) => {
  try {
    const { guildId } = req.params
    const result = await pool.query(`SELECT config FROM leveling_configs WHERE guild_id = $1`, [guildId])
    if (result.rows.length === 0) return res.json({})
    res.json(result.rows[0].config || {})
  } catch (err) {
    next(err)
  }
})

router.put('/:guildId/leveling', async (req, res, next) => {
  try {
    const { guildId } = req.params
    const patch = req.body
    await ensureLeveling(guildId)
    const result = await pool.query(
      `UPDATE leveling_configs
       SET config = config || $2::jsonb, updated_at = NOW()
       WHERE guild_id = $1
       RETURNING config`,
      [guildId, JSON.stringify(patch)]
    )
    res.json(result.rows[0].config)
  } catch (err) {
    next(err)
  }
})

export default router

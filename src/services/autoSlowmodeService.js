import { getFromDb, setInDb } from '../utils/database.js';
import { logger } from '../utils/logger.js';

// ── Config ────────────────────────────────────────────────────────────────────
const DB_KEY      = (guildId) => `guild:${guildId}:auto_slowmode`;
const WINDOW_MS   = 5000;   // 5-second rolling window
const COOLDOWN_MS = 30000;  // 30s of calm before removing slowmode

// ── Tier thresholds ───────────────────────────────────────────────────────────
function getTier(count) {
  if (count >= 10) return 5;
  if (count >= 5)  return 1;
  return 0;
}

// ── In-memory enabled cache (guild id → boolean) ──────────────────────────────
// Avoids a DB round-trip on every single message. Populated lazily on first
// message per guild after startup, then kept in sync by enable/disable calls.
const enabledCache = new Map();

async function isEnabledForGuild(guildId) {
  if (enabledCache.has(guildId)) return enabledCache.get(guildId);
  // Cold start: load from DB once and cache it.
  try {
    const config = await getFromDb(DB_KEY(guildId), null);
    const enabled = config?.enabled === true;
    enabledCache.set(guildId, enabled);
    return enabled;
  } catch {
    return false;
  }
}

// ── In-memory per-channel state ───────────────────────────────────────────────
// channelId → { timestamps: number[], currentSlowmode: number, timer: NodeJS.Timeout|null }
const state = new Map();

function getChannelState(channelId) {
  if (!state.has(channelId)) {
    state.set(channelId, { timestamps: [], currentSlowmode: 0, timer: null });
  }
  return state.get(channelId);
}

function pruneWindow(timestamps) {
  const cutoff = Date.now() - WINDOW_MS;
  return timestamps.filter(ts => ts > cutoff);
}

async function applySlowmode(channel, seconds, reason) {
  try {
    await channel.setRateLimitPerUser(seconds, reason);
    logger.info(`[AutoSlowmode] Set slowmode to ${seconds}s in #${channel.name} (${channel.guild.name})`);
  } catch (err) {
    logger.warn(`[AutoSlowmode] Failed to set slowmode in ${channel.id}: ${err.message}`);
  }
}

// ── Calm-down helper ──────────────────────────────────────────────────────────
// Schedules (or reschedules) the 30-second cooldown timer for a channel.
// If activity spikes again before the timer fires, the timer is cancelled by
// the spike handler below.
function scheduleCalmdown(ch, channel) {
  if (ch.timer) return; // already counting down

  ch.timer = setTimeout(async () => {
    ch.timer = null;
    const fresh = pruneWindow(ch.timestamps);
    if (getTier(fresh.length) === 0) {
      // Still calm — remove slowmode
      ch.currentSlowmode = 0;
      ch.timestamps      = fresh;
      await applySlowmode(channel, 0, 'AutoSlowmode: activity normalized');
      await channel.send({
        content: '✅ **Slowmode removed** — activity has returned to normal.'
      }).catch(() => null);
    } else {
      // Activity picked back up while we were waiting — restart the timer
      scheduleCalmdown(ch, channel);
    }
  }, COOLDOWN_MS);
}

// ── Main per-message handler ──────────────────────────────────────────────────
export async function handleAutoSlowmode(message) {
  if (message.author.bot) return;
  if (!message.guild)     return;

  // Skip users with Administrator or ManageMessages
  if (
    message.member?.permissions?.has('Administrator') ||
    message.member?.permissions?.has('ManageMessages')
  ) return;

  // Fast in-memory check — no DB call on the hot path
  if (!(await isEnabledForGuild(message.guild.id))) return;

  const { channel } = message;
  const ch  = getChannelState(channel.id);
  const now = Date.now();

  ch.timestamps = pruneWindow(ch.timestamps);
  ch.timestamps.push(now);

  const count           = ch.timestamps.length;
  const targetSlowmode  = getTier(count);

  // ── Spike: raise (or escalate) slowmode ──────────────────────────────────
  if (targetSlowmode > ch.currentSlowmode) {
    // Cancel any pending calm-down timer — we're spiking again
    if (ch.timer) { clearTimeout(ch.timer); ch.timer = null; }

    ch.currentSlowmode = targetSlowmode;
    await applySlowmode(channel, targetSlowmode, 'AutoSlowmode: message spike detected');

    const label = targetSlowmode === 1 ? '1 second' : `${targetSlowmode} seconds`;
    await channel.send({
      content: `🐢 **Slowmode activated** — ${label} per message due to a message spike. It will be removed once activity calms down.`
    }).catch(() => null);
    return;
  }

  // ── Calm: activity dropped below the tier — start cooldown if needed ─────
  if (ch.currentSlowmode > 0 && targetSlowmode === 0) {
    scheduleCalmdown(ch, channel);
  }
}

// ── Config helpers ────────────────────────────────────────────────────────────
export async function getAutoSlowmodeConfig(guildId) {
  try {
    const config = await getFromDb(DB_KEY(guildId), null);
    return config || { enabled: false };
  } catch {
    return { enabled: false };
  }
}

export async function enableAutoSlowmode(guildId) {
  try {
    await setInDb(DB_KEY(guildId), { enabled: true, updatedAt: Date.now() });
    enabledCache.set(guildId, true);   // keep cache in sync immediately
    return true;
  } catch {
    return false;
  }
}

export async function disableAutoSlowmode(guildId) {
  try {
    await setInDb(DB_KEY(guildId), { enabled: false, updatedAt: Date.now() });
    enabledCache.set(guildId, false);  // keep cache in sync immediately
    // Clean up any active slowmodes for this guild — best-effort
    state.forEach((ch, channelId) => {
      if (ch.timer) { clearTimeout(ch.timer); ch.timer = null; }
    });
    return true;
  } catch {
    return false;
  }
}

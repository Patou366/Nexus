import { getFromDb, setInDb } from '../utils/database.js';
import { logger } from '../utils/logger.js';

// ── Config ────────────────────────────────────────────────────────────────────
const DB_KEY          = (guildId) => `guild:${guildId}:auto_slowmode`;
const WINDOW_MS       = 5000;   // 5-second rolling window
const COOLDOWN_MS     = 30000;  // 30s of calm before removing slowmode
const IGNORED_PERMS   = ['Administrator', 'ManageMessages'];

// ── Tier thresholds ───────────────────────────────────────────────────────────
function getTier(count) {
  if (count >= 10) return 5;
  if (count >= 5)  return 1;
  return 0;
}

// ── In-memory state ───────────────────────────────────────────────────────────
// channelId → { timestamps: number[], currentSlowmode: number, calmSince: number|null, timer: NodeJS.Timeout|null }
const state = new Map();

function getChannelState(channelId) {
  if (!state.has(channelId)) {
    state.set(channelId, { timestamps: [], currentSlowmode: 0, calmSince: null, timer: null });
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
    logger.warn(`[AutoSlowmode] Failed to set slowmode in ${channel.id}:`, err.message);
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────
export async function handleAutoSlowmode(message) {
  if (message.author.bot) return;
  if (!message.guild)     return;

  const { guild, channel, member } = message;

  // Skip admins / moderators
  if (member?.permissions?.has('Administrator') || member?.permissions?.has('ManageMessages')) return;

  const config = await getAutoSlowmodeConfig(guild.id);
  if (!config.enabled) return;

  const ch = getChannelState(channel.id);
  const now = Date.now();

  ch.timestamps = pruneWindow(ch.timestamps);
  ch.timestamps.push(now);

  const count = ch.timestamps.length;
  const targetSlowmode = getTier(count);

  // ── Spike detected — raise slowmode ──────────────────────────────────────
  if (targetSlowmode > ch.currentSlowmode) {
    ch.calmSince = null;
    if (ch.timer) { clearTimeout(ch.timer); ch.timer = null; }

    ch.currentSlowmode = targetSlowmode;
    await applySlowmode(channel, targetSlowmode, 'AutoSlowmode: message spike detected');

    const label = targetSlowmode === 1 ? '1 second' : `${targetSlowmode} seconds`;
    await channel.send({
      content: `🐢 **Slowmode activated** — ${label} per message due to a message spike. It will be removed once activity calms down.`
    }).catch(() => null);
    return;
  }

  // ── Activity calming down — start cooldown timer ──────────────────────────
  if (ch.currentSlowmode > 0 && targetSlowmode === 0) {
    if (!ch.calmSince) {
      ch.calmSince = now;
    }

    if (ch.timer) return; // timer already running

    ch.timer = setTimeout(async () => {
      const fresh = pruneWindow(ch.timestamps);
      if (fresh.length < 5) {
        ch.currentSlowmode = 0;
        ch.calmSince       = null;
        ch.timer           = null;
        await applySlowmode(channel, 0, 'AutoSlowmode: activity normalized');
        await channel.send({
          content: `✅ **Slowmode removed** — activity has returned to normal.`
        }).catch(() => null);
      } else {
        ch.timer = null;
      }
    }, COOLDOWN_MS);
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
    return true;
  } catch {
    return false;
  }
}

export async function disableAutoSlowmode(guildId) {
  try {
    await setInDb(DB_KEY(guildId), { enabled: false, updatedAt: Date.now() });
    return true;
  } catch {
    return false;
  }
}

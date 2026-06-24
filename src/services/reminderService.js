import { getFromDb, setInDb } from '../utils/database.js';
import { logger } from '../utils/logger.js';

const REMINDERS_KEY = 'global:reminders';
const POLL_INTERVAL_MS = 30 * 1000; // check every 30 seconds

// ── Storage helpers ───────────────────────────────────────────────────────
async function getAll() {
  return await getFromDb(REMINDERS_KEY, []);
}

async function saveAll(reminders) {
  await setInDb(REMINDERS_KEY, reminders);
}

export async function addReminder(userId, message, fireAt) {
  const reminders = await getAll();
  const id = `${userId}-${Date.now()}`;
  reminders.push({ id, userId, message, fireAt });
  await saveAll(reminders);
  return id;
}

export async function getUserReminders(userId) {
  const reminders = await getAll();
  return reminders.filter(r => r.userId === userId);
}

export async function deleteReminder(userId, id) {
  const reminders = await getAll();
  const filtered = reminders.filter(r => !(r.userId === userId && r.id === id));
  await saveAll(filtered);
  return filtered.length < reminders.length;
}

// ── Time parser ───────────────────────────────────────────────────────────
// Accepts: 30m  2h  1d  1h30m  90s  2d12h  etc.
export function parseTime(input) {
  const regex = /(\d+)\s*(d|h|m|s)/gi;
  let total = 0;
  let matched = false;

  let match;
  while ((match = regex.exec(input)) !== null) {
    const value = parseInt(match[1], 10);
    const unit  = match[2].toLowerCase();
    matched = true;
    if (unit === 'd') total += value * 86400000;
    else if (unit === 'h') total += value * 3600000;
    else if (unit === 'm') total += value * 60000;
    else if (unit === 's') total += value * 1000;
  }

  return matched ? total : null;
}

export function formatDuration(ms) {
  const parts = [];
  const d = Math.floor(ms / 86400000); ms %= 86400000;
  const h = Math.floor(ms / 3600000);  ms %= 3600000;
  const m = Math.floor(ms / 60000);    ms %= 60000;
  const s = Math.floor(ms / 1000);
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (s) parts.push(`${s}s`);
  return parts.join(' ') || '0s';
}

// ── Scheduler ─────────────────────────────────────────────────────────────
export function startReminderScheduler(client) {
  setInterval(async () => {
    try {
      const now = Date.now();
      const reminders = await getAll();
      if (!reminders.length) return;

      const due     = reminders.filter(r => r.fireAt <= now);
      const pending = reminders.filter(r => r.fireAt > now);

      if (!due.length) return;

      await saveAll(pending);

      for (const reminder of due) {
        try {
          const user = await client.users.fetch(reminder.userId).catch(() => null);
          if (!user) continue;

          await user.send({
            embeds: [{
              color: 0x5865F2,
              title: '⏰ Reminder!',
              description: reminder.message,
              footer: { text: 'TitanBot Reminder' },
              timestamp: new Date().toISOString(),
            }]
          });
        } catch (err) {
          logger.debug(`Failed to send reminder to ${reminder.userId}:`, err);
        }
      }
    } catch (err) {
      logger.error('Error in reminder scheduler:', err);
    }
  }, POLL_INTERVAL_MS);

  logger.info('⏰ Reminder scheduler started');
}

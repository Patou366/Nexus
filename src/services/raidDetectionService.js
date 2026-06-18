import { logger } from '../utils/logger.js';
import { QuarantineService } from './quarantineService.js';

/**
 * Raid Detection Service
 * Tracks join rates and cross-channel spam patterns to detect raid attacks.
 * Triggers quarantine when thresholds are exceeded.
 */

const JOIN_BURST_WINDOW_MS = 30000;  // 30 seconds
const JOIN_BURST_THRESHOLD = 10;     // 10+ members
const SPAM_WINDOW_MS = 3000;         // 3 seconds
const SPAM_CHANNEL_THRESHOLD = 3;    // 3 different channels
const SPAM_SIMILARITY_THRESHOLD = 0.85; // 85% similarity for phrase matching

const guildJoinWindows = new Map();
const guildSpamWindows = new Map();
const guildQuarantineLock = new Map();

function getGuildJoinWindow(guildId) {
  if (!guildJoinWindows.has(guildId)) {
    guildJoinWindows.set(guildId, []);
  }
  return guildJoinWindows.get(guildId);
}

function getGuildSpamWindow(guildId) {
  if (!guildSpamWindows.has(guildId)) {
    guildSpamWindows.set(guildId, new Map());
  }
  return guildSpamWindows.get(guildId);
}

function cleanupOldJoins(guildId) {
  const window = getGuildJoinWindow(guildId);
  const cutoff = Date.now() - JOIN_BURST_WINDOW_MS;
  const cleaned = window.filter(entry => entry.timestamp > cutoff);
  guildJoinWindows.set(guildId, cleaned);
  return cleaned;
}

function cleanupOldSpam(guildId) {
  const window = getGuildSpamWindow(guildId);
  const cutoff = Date.now() - SPAM_WINDOW_MS;
  for (const [phrase, entries] of window.entries()) {
    const cleaned = entries.filter(entry => entry.timestamp > cutoff);
    if (cleaned.length === 0) {
      window.delete(phrase);
    } else {
      window.set(phrase, cleaned);
    }
  }
  return window;
}

function normalizePhrase(content) {
  if (typeof content !== 'string') return '';
  return content
    .toLowerCase()
    .replace(/<@!?⁠?\d+>/g, '@mention')
    .replace(/<#\d+>/g, '#channel')
    .replace(/<:\w+:\d+>/g, ':emoji:')
    .replace(/https?:\/\/\S+/g, '[link]')
    .replace(/\s+/g, ' ')
    .trim();
}

function similarity(a, b) {
  if (a === b) return 1;
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  if (longer.length === 0) return 1;
  const costs = new Array(shorter.length + 1);
  for (let i = 0; i <= shorter.length; i++) costs[i] = i;
  for (let i = 1; i <= longer.length; i++) {
    let nw = costs[0];
    costs[0] = i;
    for (let j = 1; j <= shorter.length; j++) {
      const cj = Math.min(
        costs[j] + 1,
        costs[j - 1] + 1,
        nw + (longer[i - 1] === shorter[j - 1] ? 0 : 1)
      );
      nw = costs[j];
      costs[j] = cj;
    }
  }
  return 1 - costs[shorter.length] / longer.length;
}

function findSimilarPhrase(window, phrase) {
  for (const [existingPhrase] of window.entries()) {
    if (similarity(existingPhrase, phrase) >= SPAM_SIMILARITY_THRESHOLD) {
      return existingPhrase;
    }
  }
  return null;
}

function isQuarantineLocked(guildId) {
  return guildQuarantineLock.get(guildId) === true;
}

function setQuarantineLock(guildId, locked) {
  guildQuarantineLock.set(guildId, locked);
}

export class RaidDetectionService {
  /**
   * Process a member join event
   * @param {GuildMember} member
   * @param {Client} client
   */
  static async processMemberJoin(member, client) {
    try {
      const guildId = member.guild.id;
      const config = await this.getRaidConfig(client, guildId);
      if (!config.enabled) return;

      const window = getGuildJoinWindow(guildId);
      window.push({
        userId: member.id,
        timestamp: Date.now(),
        accountAge: member.user.createdTimestamp
      });

      const activeJoins = cleanupOldJoins(guildId);

      if (activeJoins.length >= JOIN_BURST_THRESHOLD) {
        const uniqueUserIds = [...new Set(activeJoins.map(j => j.userId))];
        const suspects = uniqueUserIds
          .map(id => member.guild.members.cache.get(id))
          .filter(Boolean);

        if (suspects.length >= JOIN_BURST_THRESHOLD && !isQuarantineLocked(guildId)) {
          setQuarantineLock(guildId, true);
          logger.warn(`Raid detected: join burst in guild ${member.guild.name}`, {
            event: 'raid.join_burst',
            guildId,
            count: activeJoins.length,
            threshold: JOIN_BURST_THRESHOLD
          });

          await QuarantineService.triggerQuarantine({
            guild: member.guild,
            client,
            suspects,
            reason: 'raid_join_burst',
            metadata: {
              joinCount: activeJoins.length,
              windowMs: JOIN_BURST_WINDOW_MS,
              detectedAt: new Date().toISOString()
            }
          });

          // Release lock after 5 minutes
          setTimeout(() => setQuarantineLock(guildId, false), 300000);
        }
      }
    } catch (error) {
      logger.error('Error in raid detection member join:', error);
    }
  }

  /**
   * Process a message for cross-channel spam detection
   * @param {Message} message
   * @param {Client} client
   */
  static async processMessage(message, client) {
    try {
      if (message.author.bot || !message.guild) return;

      const guildId = message.guild.id;
      const config = await this.getRaidConfig(client, guildId);
      if (!config.enabled) return;

      const content = message.content;
      if (!content || content.length < 5) return;

      const normalized = normalizePhrase(content);
      if (!normalized || normalized.length < 5) return;

      const window = getGuildSpamWindow(guildId);
      cleanupOldSpam(guildId);

      const existingPhrase = findSimilarPhrase(window, normalized);
      const targetPhrase = existingPhrase || normalized;

      const entries = window.get(targetPhrase) || [];
      entries.push({
        userId: message.author.id,
        channelId: message.channel.id,
        timestamp: Date.now(),
        messageId: message.id,
        originalContent: content
      });
      window.set(targetPhrase, entries);

      const uniqueChannels = new Set(entries.map(e => e.channelId));
      if (uniqueChannels.size >= SPAM_CHANNEL_THRESHOLD && !isQuarantineLocked(guildId)) {
        const uniqueUserIds = [...new Set(entries.map(e => e.userId))];
        const suspects = uniqueUserIds
          .map(id => message.guild.members.cache.get(id))
          .filter(Boolean);

        if (suspects.length > 0) {
          setQuarantineLock(guildId, true);
          logger.warn(`Raid detected: cross-channel spam in guild ${message.guild.name}`, {
            event: 'raid.cross_channel_spam',
            guildId,
            channels: uniqueChannels.size,
            users: uniqueUserIds.length,
            phrase: targetPhrase
          });

          await QuarantineService.triggerQuarantine({
            guild: message.guild,
            client,
            suspects,
            reason: 'raid_cross_channel_spam',
            metadata: {
              channels: [...uniqueChannels],
              channelCount: uniqueChannels.size,
              phrase: targetPhrase,
              messageCount: entries.length,
              detectedAt: new Date().toISOString()
            }
          });

          setTimeout(() => setQuarantineLock(guildId, false), 300000);
        }
      }
    } catch (error) {
      logger.error('Error in raid detection message processing:', error);
    }
  }

  /**
   * Get raid shield configuration for a guild
   */
  static async getRaidConfig(client, guildId) {
    try {
      const { getGuildConfig } = await import('../utils/database.js');
      const config = await getGuildConfig(client, guildId);
      return {
        enabled: config?.raidShield?.enabled ?? false,
        notificationChannelId: config?.raidShield?.notificationChannelId ?? null,
        verifiedRoleId: config?.raidShield?.verifiedRoleId ?? null,
        quarantineRoleId: config?.raidShield?.quarantineRoleId ?? null,
        quarantineChannelId: config?.raidShield?.quarantineChannelId ?? null,
        alertRoleId: config?.raidShield?.alertRoleId ?? null,
        autoBan: config?.raidShield?.autoBan ?? false
      };
    } catch (error) {
      logger.error('Error getting raid config:', error);
      return {
        enabled: false,
        notificationChannelId: null,
        verifiedRoleId: null,
        quarantineRoleId: null,
        quarantineChannelId: null,
        alertRoleId: null,
        autoBan: false
      };
    }
  }

  /**
   * Save raid shield configuration for a guild
   */
  static async saveRaidConfig(client, guildId, updates) {
    try {
      const { getGuildConfig, setGuildConfig } = await import('../utils/database.js');
      const config = await getGuildConfig(client, guildId);
      const raidShield = { ...config?.raidShield, ...updates };
      await setGuildConfig(client, guildId, { ...config, raidShield });
      return true;
    } catch (error) {
      logger.error('Error saving raid config:', error);
      return false;
    }
  }

  /**
   * Clear detection windows for a guild (useful after false alarm)
   */
  static clearWindows(guildId) {
    guildJoinWindows.delete(guildId);
    guildSpamWindows.delete(guildId);
    guildQuarantineLock.delete(guildId);
  }
}

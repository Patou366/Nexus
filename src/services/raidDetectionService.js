import { AuditLogEvent, PermissionsBitField } from 'discord.js';
import { logger } from '../utils/logger.js';
import { QuarantineService } from './quarantineService.js';

/**
 * Raid Detection Service
 * Tracks join rates, cross-channel spam, account age, default avatars,
 * invite link usage, and username similarity patterns to detect raid attacks.
 * Triggers quarantine when thresholds are exceeded.
 */

const JOIN_BURST_WINDOW_MS = 30000;       // 30 seconds
const JOIN_BURST_THRESHOLD = 10;          // 10+ members
const SPAM_WINDOW_MS = 3000;              // 3 seconds
const SPAM_CHANNEL_THRESHOLD = 3;         // 3 different channels
const SPAM_SIMILARITY_THRESHOLD = 0.85;   // 85% similarity for phrase matching

const SUSPICIOUS_SUBSET_THRESHOLD = 5;    // 5 flagged accounts
const ACCOUNT_AGE_THRESHOLD_DAYS = 4;     // < 4 days old
const NAME_SIMILARITY_THRESHOLD = 0.80;   // 80% name similarity
const INVITE_DOMINANCE_THRESHOLD = 0.80;  // 80% same invite

const CHANNEL_DELETE_WINDOW_MS = 5000;    // 5 seconds
const CHANNEL_DELETE_THRESHOLD = 4;       // 4 channels deleted -> kick

const DEFAULT_AVATAR_URL = 'https://cdn.discordapp.com/embed/avatars/';

const guildJoinWindows = new Map();
const guildSpamWindows = new Map();
const guildQuarantineLock = new Map();
const guildInviteCache = new Map();
const guildNamePatternLock = new Map();
const guildChannelDeleteWindows = new Map();

function getChannelDeleteWindow(guildId) {
  if (!guildChannelDeleteWindows.has(guildId)) {
    guildChannelDeleteWindows.set(guildId, new Map());
  }
  return guildChannelDeleteWindows.get(guildId);
}

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

function isUsingDefaultAvatar(user) {
  if (!user.avatar) return true;
  const avatarUrl = user.displayAvatarURL();
  return avatarUrl.startsWith(DEFAULT_AVATAR_URL);
}

function isSuspiciousAccount(user) {
  const accountAgeMs = Date.now() - user.createdTimestamp;
  const ageDays = accountAgeMs / (1000 * 60 * 60 * 24);
  const isYoung = ageDays < ACCOUNT_AGE_THRESHOLD_DAYS;
  const isDefaultAvatar = isUsingDefaultAvatar(user);
  return { isYoung, isDefaultAvatar, isFlagged: isYoung || isDefaultAvatar, ageDays };
}

function extractNameBase(name) {
  const match = name.match(/^(.+?)(\d+)$/);
  if (match) return { prefix: match[1], number: parseInt(match[2], 10) };
  return null;
}

function findSequentialPattern(members) {
  const bases = members.map(m => extractNameBase(m.user?.username || m.user?.tag || '')).filter(Boolean);
  if (bases.length < 3) return null;

  const prefixGroups = new Map();
  for (const base of bases) {
    if (!prefixGroups.has(base.prefix)) prefixGroups.set(base.prefix, []);
    prefixGroups.get(base.prefix).push(base.number);
  }

  for (const [prefix, numbers] of prefixGroups.entries()) {
    if (numbers.length < 3) continue;
    const sorted = [...numbers].sort((a, b) => a - b);
    let sequentialCount = 1;
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] === sorted[i - 1] + 1) {
        sequentialCount++;
      } else {
        sequentialCount = 1;
      }
      if (sequentialCount >= 3) {
        return { prefix, numbers: sorted };
      }
    }
  }
  return null;
}

function findSimilarNameCluster(members) {
  const names = members.map(m => (m.user?.username || m.user?.tag || '').toLowerCase()).filter(n => n.length > 0);
  if (names.length < 3) return null;

  const clusters = [];
  const visited = new Set();

  for (let i = 0; i < names.length; i++) {
    if (visited.has(i)) continue;
    const cluster = [i];
    visited.add(i);
    for (let j = i + 1; j < names.length; j++) {
      if (visited.has(j)) continue;
      if (similarity(names[i], names[j]) >= NAME_SIMILARITY_THRESHOLD) {
        cluster.push(j);
        visited.add(j);
      }
    }
    if (cluster.length >= 3) {
      clusters.push(cluster.map(idx => members[idx]));
    }
  }

  return clusters.length > 0 ? clusters : null;
}

async function getInviteUsed(guild, member) {
  try {
    const oldInvites = guildInviteCache.get(guild.id);
    const newInvites = await guild.invites.fetch();
    if (!oldInvites) {
      guildInviteCache.set(guild.id, new Map(newInvites.map(i => [i.code, i.uses])));
      return null;
    }
    let usedCode = null;
    for (const [code, invite] of newInvites) {
      const oldUses = oldInvites.get(code);
      if (oldUses !== undefined && invite.uses > oldUses) {
        usedCode = code;
        break;
      }
    }
    guildInviteCache.set(guild.id, new Map(newInvites.map(i => [i.code, i.uses])));
    return usedCode;
  } catch (error) {
    return null;
  }
}

function findDominantInvite(window) {
  const inviteCounts = new Map();
  for (const entry of window) {
    if (entry.inviteCode) {
      inviteCounts.set(entry.inviteCode, (inviteCounts.get(entry.inviteCode) || 0) + 1);
    }
  }
  let dominant = null;
  let maxCount = 0;
  for (const [code, count] of inviteCounts.entries()) {
    if (count > maxCount) {
      maxCount = count;
      dominant = code;
    }
  }
  const total = window.length;
  const ratio = total > 0 ? maxCount / total : 0;
  return { code: dominant, count: maxCount, ratio, total };
}

function getSuspiciousSubset(window) {
  const flagged = [];
  const unflagged = [];
  for (const entry of window) {
    if (entry.isSuspicious) {
      flagged.push(entry);
    } else {
      unflagged.push(entry);
    }
  }
  return { flagged, unflagged };
}

function getFlaggedMembers(window) {
  return window.filter(e => e.isSuspicious).map(e => e.member);
}

function getMembersFromEntries(entries) {
  return entries.map(e => e.member).filter(Boolean);
}

function getNamePatternMembers(window, pattern) {
  return window.filter(e => {
    const base = extractNameBase(e.member?.user?.username || '');
    return base && base.prefix === pattern.prefix;
  }).map(e => e.member);
}

function getSimilarityClusterMembers(window, cluster) {
  const indices = new Set();
  const members = window.map(e => e.member);
  for (const c of cluster) {
    for (const m of c) {
      const idx = members.indexOf(m);
      if (idx >= 0) indices.add(idx);
    }
  }
  return [...indices].map(i => window[i].member);
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

      const inviteCode = await getInviteUsed(member.guild, member);
      const suspiciousCheck = isSuspiciousAccount(member.user);

      const window = getGuildJoinWindow(guildId);
      window.push({
        userId: member.id,
        timestamp: Date.now(),
        accountAge: member.user.createdTimestamp,
        isSuspicious: suspiciousCheck.isFlagged,
        suspicionReason: suspiciousCheck.isYoung
          ? (suspiciousCheck.isDefaultAvatar ? 'young_account+default_avatar' : 'young_account')
          : 'default_avatar',
        ageDays: suspiciousCheck.ageDays,
        inviteCode,
        member
      });

      const activeJoins = cleanupOldJoins(guildId);

      // Check 1: Suspicious subset (young accounts or default avatars)
      const { flagged } = getSuspiciousSubset(activeJoins);
      if (flagged.length >= SUSPICIOUS_SUBSET_THRESHOLD && !isQuarantineLocked(guildId)) {
        setQuarantineLock(guildId, true);
        const suspects = getFlaggedMembers(activeJoins);
        const dominant = findDominantInvite(activeJoins);

        logger.warn(`Raid detected: suspicious subset in ${member.guild.name}`, {
          event: 'raid.suspicious_subset',
          guildId,
          count: flagged.length,
          threshold: SUSPICIOUS_SUBSET_THRESHOLD,
          inviteCode: dominant.code
        });

        await QuarantineService.triggerQuarantine({
          guild: member.guild,
          client,
          suspects,
          reason: 'raid_suspicious_subset',
          metadata: {
            joinCount: activeJoins.length,
            flaggedCount: flagged.length,
            windowMs: JOIN_BURST_WINDOW_MS,
            detectedAt: new Date().toISOString(),
            dominantInvite: dominant.code || null,
            inviteDominance: dominant.ratio,
            tripReasons: ['suspicious_accounts']
          }
        });

        if (dominant.code && dominant.ratio >= INVITE_DOMINANCE_THRESHOLD) {
          await QuarantineService.deleteInvite(member.guild, dominant.code);
        }

        setTimeout(() => setQuarantineLock(guildId, false), 300000);
        return;
      }

      // Check 2: Name sequential pattern
      const sequentialPattern = findSequentialPattern(activeJoins.map(e => e.member));
      if (sequentialPattern && !isQuarantineLocked(guildId) && !guildNamePatternLock.get(guildId)) {
        guildNamePatternLock.set(guildId, true);
        const suspects = getNamePatternMembers(activeJoins, sequentialPattern);
        const dominant = findDominantInvite(activeJoins);

        logger.warn(`Raid detected: name sequential pattern in ${member.guild.name}`, {
          event: 'raid.name_pattern',
          guildId,
          prefix: sequentialPattern.prefix,
          count: suspects.length
        });

        await QuarantineService.triggerQuarantine({
          guild: member.guild,
          client,
          suspects,
          reason: 'raid_name_pattern',
          metadata: {
            joinCount: activeJoins.length,
            pattern: sequentialPattern.prefix,
            windowMs: JOIN_BURST_WINDOW_MS,
            detectedAt: new Date().toISOString(),
            dominantInvite: dominant.code || null,
            inviteDominance: dominant.ratio,
            tripReasons: ['name_sequential']
          }
        });

        if (dominant.code && dominant.ratio >= INVITE_DOMINANCE_THRESHOLD) {
          await QuarantineService.deleteInvite(member.guild, dominant.code);
        }

        setTimeout(() => {
          setQuarantineLock(guildId, false);
          guildNamePatternLock.set(guildId, false);
        }, 300000);
        return;
      }

      // Check 3: Name similarity cluster
      const similarityClusters = findSimilarNameCluster(activeJoins.map(e => e.member));
      if (similarityClusters && !isQuarantineLocked(guildId) && !guildNamePatternLock.get(guildId)) {
        guildNamePatternLock.set(guildId, true);
        const suspects = getSimilarityClusterMembers(activeJoins, similarityClusters);
        const dominant = findDominantInvite(activeJoins);

        logger.warn(`Raid detected: name similarity cluster in ${member.guild.name}`, {
          event: 'raid.name_similarity',
          guildId,
          clusterCount: similarityClusters.length,
          suspectCount: suspects.length
        });

        await QuarantineService.triggerQuarantine({
          guild: member.guild,
          client,
          suspects,
          reason: 'raid_name_similarity',
          metadata: {
            joinCount: activeJoins.length,
            windowMs: JOIN_BURST_WINDOW_MS,
            detectedAt: new Date().toISOString(),
            dominantInvite: dominant.code || null,
            inviteDominance: dominant.ratio,
            tripReasons: ['name_similarity']
          }
        });

        if (dominant.code && dominant.ratio >= INVITE_DOMINANCE_THRESHOLD) {
          await QuarantineService.deleteInvite(member.guild, dominant.code);
        }

        setTimeout(() => {
          setQuarantineLock(guildId, false);
          guildNamePatternLock.set(guildId, false);
        }, 300000);
        return;
      }

      // Check 4: Standard join burst (10+ in 30s)
      if (activeJoins.length >= JOIN_BURST_THRESHOLD && !isQuarantineLocked(guildId)) {
        setQuarantineLock(guildId, true);
        const uniqueUserIds = [...new Set(activeJoins.map(j => j.userId))];
        const suspects = uniqueUserIds
          .map(id => member.guild.members.cache.get(id))
          .filter(Boolean);
        const dominant = findDominantInvite(activeJoins);

        if (suspects.length >= JOIN_BURST_THRESHOLD) {
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
              detectedAt: new Date().toISOString(),
              dominantInvite: dominant.code || null,
              inviteDominance: dominant.ratio,
              tripReasons: ['mass_join']
            }
          });

          if (dominant.code && dominant.ratio >= INVITE_DOMINANCE_THRESHOLD) {
            await QuarantineService.deleteInvite(member.guild, dominant.code);
          }

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
              detectedAt: new Date().toISOString(),
              tripReasons: ['cross_channel_spam']
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
   * Process a channel deletion for anti-nuke protection.
   * If a single user deletes CHANNEL_DELETE_THRESHOLD channels within
   * CHANNEL_DELETE_WINDOW_MS, they are automatically kicked.
   * @param {GuildChannel} channel
   * @param {Client} client
   */
  static async processChannelDelete(channel, client) {
    try {
      const guild = channel.guild;
      if (!guild) return;

      const guildId = guild.id;
      const config = await this.getRaidConfig(client, guildId);
      if (!config.enabled) return;

      // We need View Audit Log to know who deleted the channel
      const me = guild.members.me;
      if (!me || !me.permissions.has(PermissionsBitField.Flags.ViewAuditLog)) {
        logger.debug(`Anti-nuke: missing ViewAuditLog permission in guild ${guildId}`);
        return;
      }

      // Identify the executor from the audit log
      let executorId = null;
      try {
        const logs = await guild.fetchAuditLogs({
          type: AuditLogEvent.ChannelDelete,
          limit: 5
        });
        const entry =
          logs.entries.find(e => e.target?.id === channel.id) || logs.entries.first();

        // Only trust recent entries to avoid matching a stale deletion
        if (entry && Date.now() - entry.createdTimestamp < CHANNEL_DELETE_WINDOW_MS + 2000) {
          executorId = entry.executor?.id || null;
        }
      } catch (err) {
        logger.debug('Anti-nuke: could not fetch audit logs:', err.message);
        return;
      }

      if (!executorId) return;

      // Never act on the bot itself or the server owner
      if (executorId === client.user.id) return;
      if (executorId === guild.ownerId) return;

      // Track deletions within the rolling window
      const now = Date.now();
      const guildWindow = getChannelDeleteWindow(guildId);
      const timestamps = (guildWindow.get(executorId) || []).filter(
        ts => now - ts < CHANNEL_DELETE_WINDOW_MS
      );
      timestamps.push(now);
      guildWindow.set(executorId, timestamps);

      if (timestamps.length < CHANNEL_DELETE_THRESHOLD) return;

      // Threshold reached — reset to prevent repeat triggers, then kick
      guildWindow.set(executorId, []);

      const member = await guild.members.fetch(executorId).catch(() => null);
      const kickReason = `Anti-nuke: deleted ${timestamps.length} channels in under ${CHANNEL_DELETE_WINDOW_MS / 1000}s`;

      let kicked = false;
      if (member && member.kickable) {
        await member.kick(kickReason).catch(err => {
          logger.warn(`Anti-nuke: failed to kick ${executorId}:`, err.message);
        });
        kicked = true;
      } else {
        logger.warn(`Anti-nuke: member ${executorId} is not kickable in guild ${guildId}`);
      }

      logger.warn(`Anti-nuke: mass channel deletion in ${guild.name}`, {
        event: 'raid.channel_nuke',
        guildId,
        executorId,
        count: timestamps.length,
        kicked
      });

      await this.sendChannelNukeAlert({
        guild,
        config,
        executorId,
        count: timestamps.length,
        kicked
      });
    } catch (error) {
      logger.error('Error in raid detection channel delete:', error);
    }
  }

  /**
   * Send a staff alert when a channel-nuke is detected.
   */
  static async sendChannelNukeAlert({ guild, config, executorId, count, kicked }) {
    try {
      if (!config.notificationChannelId) return;
      const channel = guild.channels.cache.get(config.notificationChannelId);
      if (!channel?.isTextBased()) return;

      const { createEmbed } = await import('../utils/embeds.js');
      const embed = createEmbed({
        title: '🛡️ Anti-Nuke Triggered',
        description: kicked
          ? `<@${executorId}> deleted **${count} channels** in under ${CHANNEL_DELETE_WINDOW_MS / 1000} seconds and was automatically **kicked**.`
          : `<@${executorId}> deleted **${count} channels** in under ${CHANNEL_DELETE_WINDOW_MS / 1000} seconds. I could **not** kick them — please check my role position and permissions.`,
        color: 'warning',
        fields: [
          { name: 'User', value: `<@${executorId}> (${executorId})`, inline: true },
          { name: 'Channels deleted', value: `${count}`, inline: true },
          { name: 'Action', value: kicked ? 'Kicked' : 'Kick failed', inline: true }
        ]
      });

      const pingContent = config.alertRoleId ? `<@&${config.alertRoleId}>` : null;
      await channel.send({
        content: pingContent,
        embeds: [embed],
        allowedMentions: { roles: config.alertRoleId ? [config.alertRoleId] : [] }
      });
    } catch (error) {
      logger.error('Error sending channel-nuke alert:', error);
    }
  }

  /**
   * Initialize invite cache for a guild (call on startup/ready)
   */
  static async initializeInviteCache(guild) {
    try {
      const invites = await guild.invites.fetch();
      guildInviteCache.set(guild.id, new Map(invites.map(i => [i.code, i.uses])));
    } catch (error) {
      logger.debug(`Could not cache invites for guild ${guild.id}:`, error.message);
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
    guildNamePatternLock.delete(guildId);
    guildChannelDeleteWindows.delete(guildId);
  }
}

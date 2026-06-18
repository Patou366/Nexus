import {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, PermissionFlagsBits
} from 'discord.js';
import { logger } from '../utils/logger.js';
import { getFromDb, setInDb } from '../utils/database.js';
import { getColor } from '../config/bot.js';
import { sanitizeMarkdown } from '../utils/sanitization.js';
import { ModerationService } from './moderationService.js';

const QUARANTINE_DB_PREFIX = 'quarantine';

/**
 * Bilingual text helper
 * Returns an object with both English and Spanish versions.
 */
function t(en, es) {
  return { en, es };
}

const STRINGS = {
  alertTitle: t('⚠️ RAID SHIELD TRIGGERED', '⚠️ ESCUDO ANTI-RAID ACTIVADO'),
  alertDescription: t(
    'A raid pattern has been detected in this server. The following accounts have been automatically quarantined pending staff review.',
    'Se ha detectado un patrón de raid en este servidor. Las siguientes cuentas han sido puestas en cuarentena automáticamente a la espera de revisión del staff.'
  ),
  reason: t('Reason', 'Razón'),
  joinBurstReason: t('Join Burst: {count} members joined in {seconds}s', 'Ráfaga de ingresos: {count} miembros se unieron en {seconds}s'),
  spamReason: t('Cross-Channel Spam: same phrase in {count} channels', 'Spam multi-canal: misma frase en {count} canales'),
  suspects: t('Suspects ({count})', 'Sospechosos ({count})'),
  detectedAt: t('Detected', 'Detectado'),
  quarantineChannel: t('Quarantine Channel', 'Canal de Cuarentena'),
  actionRow: t('Staff Actions', 'Acciones del Staff'),
  banAll: t('Ban All / Banear Todos', 'Ban All / Banear Todos'),
  falseAlarm: t('False Alarm / Falsa Alarma', 'False Alarm / Falsa Alarma'),
  bannedSuccess: t('Banned {count} user(s)', 'Baneado(s) {count} usuario(s)'),
  falseAlarmSuccess: t('Quarantine lifted for {count} user(s)', 'Cuarentena levantada para {count} usuario(s)'),
  noPermission: t('You do not have permission to perform this action.', 'No tienes permiso para realizar esta acción.'),
  alreadyResolved: t('This quarantine has already been resolved.', 'Esta cuarentena ya ha sido resuelta.'),
  quarantineLogTitle: t('Quarantine Event', 'Evento de Cuarentena'),
  statusQuarantined: t('Quarantined', 'En Cuarentena'),
  statusResolved: t('Resolved', 'Resuelto'),
  statusBanned: t('Banned', 'Baneado'),
  errorMissingRole: t('Quarantine role not configured.', 'Rol de cuarentena no configurado.'),
  errorMissingChannel: t('Quarantine channel not found.', 'Canal de cuarentena no encontrado.')
};

function formatBilingual(strings, placeholders = {}) {
  let en = strings.en;
  let es = strings.es;
  for (const [key, value] of Object.entries(placeholders)) {
    en = en.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
    es = es.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
  }
  return `${en}\n\n${es}`;
}

function formatBilingualField(name, value, inline = false) {
  return { name: `${name.en} / ${name.es}`, value, inline };
}

function formatBilingualEmbed({ title, description, color, fields = [], footer, timestamp }) {
  const embed = new EmbedBuilder();
  embed.setTitle(`${title.en}\n${title.es}`);
  embed.setDescription(description);
  embed.setColor(color);
  if (fields.length > 0) embed.addFields(fields);
  if (footer) embed.setFooter({ text: `${footer.en} | ${footer.es}` });
  if (timestamp) embed.setTimestamp();
  return embed;
}

export class QuarantineService {
  /**
   * Trigger a quarantine event
   */
  static async triggerQuarantine({ guild, client, suspects, reason, metadata }) {
    try {
      const { RaidDetectionService } = await import('./raidDetectionService.js');
      const config = await RaidDetectionService.getRaidConfig(client, guild.id);

      if (!config.enabled) {
        logger.debug(`Raid shield disabled for guild ${guild.id}, skipping quarantine`);
        return { success: false, reason: 'disabled' };
      }

      const quarantineId = `${guild.id}_${Date.now()}`;
      const quarantineRole = config.quarantineRoleId ? guild.roles.cache.get(config.quarantineRoleId) : null;
      const verifiedRole = config.verifiedRoleId ? guild.roles.cache.get(config.verifiedRoleId) : null;
      const quarantineChannel = config.quarantineChannelId ? guild.channels.cache.get(config.quarantineChannelId) : null;

      const quarantineData = {
        id: quarantineId,
        guildId: guild.id,
        suspects: [],
        reason,
        metadata,
        status: 'quarantined',
        resolvedAt: null,
        resolvedBy: null,
        resolution: null,
        createdAt: new Date().toISOString()
      };

      const processedSuspects = [];
      for (const suspect of suspects) {
        const previousRoles = suspect.roles.cache
          .filter(r => r.id !== guild.id && r.id !== config.quarantineRoleId)
          .map(r => r.id);

        try {
          // Strip verified role
          if (verifiedRole && suspect.roles.cache.has(verifiedRole.id)) {
            await suspect.roles.remove(verifiedRole, 'Raid shield quarantine');
          }

          // Assign quarantine role
          if (quarantineRole) {
            await suspect.roles.add(quarantineRole, 'Raid shield quarantine');
          }

          // Move to quarantine channel if it's a voice channel
          if (quarantineChannel && quarantineChannel.isVoiceBased() && suspect.voice?.channel) {
            await suspect.voice.setChannel(quarantineChannel, 'Raid shield quarantine').catch(() => null);
          }

          processedSuspects.push({
            userId: suspect.id,
            username: suspect.user.tag,
            previousRoles: [...previousRoles],
            quarantinedAt: new Date().toISOString()
          });
        } catch (roleError) {
          logger.warn(`Failed to quarantine member ${suspect.id}:`, roleError.message);
        }
      }

      quarantineData.suspects = processedSuspects;

      // Store in DB
      const dbKey = `${QUARANTINE_DB_PREFIX}:${quarantineId}`;
      await setInDb(dbKey, quarantineData);
      await this.appendToQuarantineList(client, guild.id, quarantineId);

      // Log to DB
      await this.logQuarantineToDb(client, guild.id, quarantineData);

      // Send staff alert
      await this.sendStaffAlert({ guild, client, quarantineData, config, quarantineId });

      logger.info(`Quarantine triggered: ${quarantineId} in ${guild.name}`, {
        event: 'quarantine.triggered',
        guildId: guild.id,
        quarantineId,
        suspectCount: processedSuspects.length,
        reason
      });

      return { success: true, quarantineId, suspectCount: processedSuspects.length };
    } catch (error) {
      logger.error('Error triggering quarantine:', error);
      return { success: false, reason: error.message };
    }
  }

  /**
   * Send bilingual staff alert embed with action buttons
   */
  static async sendStaffAlert({ guild, client, quarantineData, config, quarantineId }) {
    try {
      const notificationChannelId = config.notificationChannelId;
      if (!notificationChannelId) return;

      const channel = guild.channels.cache.get(notificationChannelId);
      if (!channel?.isTextBased()) return;

      const reasonText = quarantineData.reason === 'raid_join_burst'
        ? formatBilingual(STRINGS.joinBurstReason, {
            count: quarantineData.metadata?.joinCount || quarantineData.suspects.length,
            seconds: Math.round((quarantineData.metadata?.windowMs || 30000) / 1000)
          })
        : formatBilingual(STRINGS.spamReason, {
            count: quarantineData.metadata?.channelCount || 0
          });

      const suspectList = quarantineData.suspects
        .map((s, i) => `${i + 1}. <@${s.userId}> \`${sanitizeMarkdown(s.username)}\``)
        .join('\n');

      const fields = [
        formatBilingualField(STRINGS.reason, reasonText, false),
        formatBilingualField(STRINGS.suspects, suspectList || 'N/A', false),
        formatBilingualField(STRINGS.detectedAt, `<t:${Math.floor(Date.now() / 1000)}:F>`, true),
        formatBilingualField(STRINGS.statusQuarantined, '🔒', true)
      ];

      if (quarantineData.metadata?.channels) {
        const channelList = quarantineData.metadata.channels.map(cid => `<#${cid}>`).join(', ');
        fields.push(formatBilingualField(
          t('Channels', 'Canales'),
          channelList,
          false
        ));
      }

      const embed = formatBilingualEmbed({
        title: STRINGS.alertTitle,
        description: formatBilingual(STRINGS.alertDescription),
        color: getColor('warning'),
        fields,
        footer: t('Quarantine ID', 'ID de Cuarentena'),
        timestamp: true
      });
      embed.setFooter({ text: `${STRINGS.quarantineLogTitle.en} | ID: ${quarantineId}` });

      const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`quarantine_ban_all:${quarantineId}`)
          .setLabel(STRINGS.banAll.en)
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`quarantine_false_alarm:${quarantineId}`)
          .setLabel(STRINGS.falseAlarm.en)
          .setStyle(ButtonStyle.Secondary)
      );

      const pingContent = config.alertRoleId ? `<@&${config.alertRoleId}>` : null;

      await channel.send({
        content: pingContent,
        embeds: [embed],
        components: [actionRow]
      });
    } catch (error) {
      logger.error('Error sending staff alert:', error);
    }
  }

  /**
   * Ban all quarantined users
   */
  static async banAll({ quarantineId, guild, moderator, client, deleteDays = 1 }) {
    try {
      const dbKey = `${QUARANTINE_DB_PREFIX}:${quarantineId}`;
      const quarantineData = await getFromDb(dbKey, null);
      if (!quarantineData) {
        throw new Error('Quarantine record not found');
      }
      if (quarantineData.status !== 'quarantined') {
        throw new Error('Quarantine already resolved');
      }

      const bannedUsers = [];
      const failedUsers = [];

      for (const suspect of quarantineData.suspects) {
        try {
          const member = await guild.members.fetch(suspect.userId).catch(() => null);
          const user = member?.user || await client.users.fetch(suspect.userId).catch(() => null);
          if (!user) continue;

          await guild.members.ban(user.id, {
            reason: `Raid shield quarantine - banned by ${moderator.user.tag} (${quarantineId})`,
            deleteMessageDays: deleteDays
          });
          bannedUsers.push(suspect);
        } catch (error) {
          logger.warn(`Failed to ban ${suspect.userId}:`, error.message);
          failedUsers.push(suspect);
        }
      }

      quarantineData.status = 'banned';
      quarantineData.resolvedAt = new Date().toISOString();
      quarantineData.resolvedBy = moderator.id;
      quarantineData.resolution = 'ban_all';
      quarantineData.bannedUsers = bannedUsers;
      quarantineData.failedUsers = failedUsers;
      await setInDb(dbKey, quarantineData);
      await this.logQuarantineToDb(client, guild.id, quarantineData);

      // Clear raid windows
      const { RaidDetectionService: RDS1 } = await import('./raidDetectionService.js');
      RDS1.clearWindows(guild.id);

      return { success: true, bannedCount: bannedUsers.length, failedCount: failedUsers.length };
    } catch (error) {
      logger.error('Error banning all quarantined users:', error);
      throw error;
    }
  }

  /**
   * Resolve false alarm - restore roles and release
   */
  static async resolveFalseAlarm({ quarantineId, guild, moderator, client }) {
    try {
      const dbKey = `${QUARANTINE_DB_PREFIX}:${quarantineId}`;
      const quarantineData = await getFromDb(dbKey, null);
      if (!quarantineData) {
        throw new Error('Quarantine record not found');
      }
      if (quarantineData.status !== 'quarantined') {
        throw new Error('Quarantine already resolved');
      }

      const { RaidDetectionService } = await import('./raidDetectionService.js');
      const config = await RaidDetectionService.getRaidConfig(client, guild.id);
      const quarantineRole = config.quarantineRoleId ? guild.roles.cache.get(config.quarantineRoleId) : null;
      const verifiedRole = config.verifiedRoleId ? guild.roles.cache.get(config.verifiedRoleId) : null;

      const restoredUsers = [];
      const failedUsers = [];

      for (const suspect of quarantineData.suspects) {
        try {
          const member = await guild.members.fetch(suspect.userId).catch(() => null);
          if (!member) {
            failedUsers.push({ ...suspect, reason: 'Member left guild' });
            continue;
          }

          // Remove quarantine role
          if (quarantineRole && member.roles.cache.has(quarantineRole.id)) {
            await member.roles.remove(quarantineRole, 'False alarm - quarantine lifted');
          }

          // Restore previous roles
          for (const roleId of suspect.previousRoles) {
            const role = guild.roles.cache.get(roleId);
            if (role && !member.roles.cache.has(role.id)) {
              await member.roles.add(role, 'False alarm - role restored').catch(() => null);
            }
          }

          // Restore verified role
          if (verifiedRole && !member.roles.cache.has(verifiedRole.id)) {
            await member.roles.add(verifiedRole, 'False alarm - verified role restored').catch(() => null);
          }

          restoredUsers.push(suspect);
        } catch (error) {
          logger.warn(`Failed to restore ${suspect.userId}:`, error.message);
          failedUsers.push({ ...suspect, reason: error.message });
        }
      }

      quarantineData.status = 'resolved';
      quarantineData.resolvedAt = new Date().toISOString();
      quarantineData.resolvedBy = moderator.id;
      quarantineData.resolution = 'false_alarm';
      quarantineData.restoredUsers = restoredUsers;
      quarantineData.failedUsers = failedUsers;
      await setInDb(dbKey, quarantineData);
      await this.logQuarantineToDb(client, guild.id, quarantineData);

      // Clear raid windows
      RaidDetectionService.clearWindows(guild.id);

      return { success: true, restoredCount: restoredUsers.length, failedCount: failedUsers.length };
    } catch (error) {
      logger.error('Error resolving false alarm:', error);
      throw error;
    }
  }

  /**
   * Log quarantine event to audit_logs table
   */
  static async logQuarantineToDb(client, guildId, data) {
    try {
      const { pgDb } = await import('../utils/postgresDatabase.js');
      if (pgDb.isAvailable()) {
        await pgDb.pool.query(
          `INSERT INTO audit_logs (guild_id, user_id, action, target_id, reason, created_at)
           VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
          [
            guildId,
            data.resolvedBy || 'system',
            `quarantine_${data.status}`,
            data.id,
            JSON.stringify({ reason: data.reason, suspectCount: data.suspects.length, metadata: data.metadata })
          ]
        );
      }
    } catch (error) {
      logger.error('Error logging quarantine to DB:', error);
    }
  }

  /**
   * Append quarantine ID to guild's quarantine list
   */
  static async appendToQuarantineList(client, guildId, quarantineId) {
    try {
      const listKey = `${QUARANTINE_DB_PREFIX}:list:${guildId}`;
      const list = await getFromDb(listKey, []);
      list.push(quarantineId);
      if (list.length > 100) {
        list.splice(0, list.length - 100);
      }
      await setInDb(listKey, list);
    } catch (error) {
      logger.error('Error appending to quarantine list:', error);
    }
  }

  /**
   * Get quarantine data by ID
   */
  static async getQuarantine(quarantineId) {
    const dbKey = `${QUARANTINE_DB_PREFIX}:${quarantineId}`;
    return await getFromDb(dbKey, null);
  }

  /**
   * Get recent quarantines for a guild
   */
  static async getGuildQuarantines(client, guildId, limit = 10) {
    try {
      const listKey = `${QUARANTINE_DB_PREFIX}:list:${guildId}`;
      const list = await getFromDb(listKey, []);
      const quarantines = [];
      for (const id of list.slice(-limit).reverse()) {
        const data = await this.getQuarantine(id);
        if (data) quarantines.push(data);
      }
      return quarantines;
    } catch (error) {
      logger.error('Error getting guild quarantines:', error);
      return [];
    }
  }

  /**
   * Check if a member has quarantine permission (admin or configured alert role)
   */
  static async canManageQuarantine(interaction, config) {
    if (!interaction.member) return false;
    if (interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return true;
    if (interaction.member.permissions.has(PermissionFlagsBits.BanMembers)) return true;
    if (config?.alertRoleId && interaction.member.roles.cache.has(config.alertRoleId)) return true;
    return false;
  }
}

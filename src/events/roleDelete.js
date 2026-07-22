import { Events, AuditLogEvent } from 'discord.js';
import { logEvent, EVENT_TYPES } from '../services/loggingService.js';
import { logger } from '../utils/logger.js';
import { buildRoleAuditFields } from '../utils/roleLogFields.js';
import { RaidDetectionService } from '../services/raidDetectionService.js';
import { checkPermGuard } from '../services/permGuardService.js';

export default {
  name: Events.GuildRoleDelete,
  once: false,

  async execute(role, client) {
    try {
      if (!role.guild) return;

      // Anti-nuke + perm guard — run in parallel
      await Promise.all([
        RaidDetectionService.processRoleDelete(role, client).catch(err =>
          logger.debug('Error in anti-nuke role delete processing:', err)
        ),
        checkPermGuard(
          role.guild, client,
          AuditLogEvent.RoleDelete, role.id,
          `deleted role @${role.name ?? role.id}`
        ).catch(err =>
          logger.debug('Error in perm guard role delete check:', err)
        ),
      ]);

      // Audit log
      const fields = buildRoleAuditFields(role, { includeMemberCount: true });

      await logEvent({
        client: role.client,
        guildId: role.guild.id,
        eventType: EVENT_TYPES.ROLE_DELETE,
        data: {
          description: `A role was deleted: ${role.name}`,
          fields
        }
      });

    } catch (error) {
      logger.error('Error in roleDelete event:', error);
    }
  }
};

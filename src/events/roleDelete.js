import { Events } from 'discord.js';
import { logEvent, EVENT_TYPES } from '../services/loggingService.js';
import { logger } from '../utils/logger.js';
import { buildRoleAuditFields } from '../utils/roleLogFields.js';
import { RaidDetectionService } from '../services/raidDetectionService.js';

export default {
  name: Events.GuildRoleDelete,
  once: false,

  async execute(role, client) {
    try {
      if (!role.guild) return;

      // Anti-nuke: detect mass role deletions
      await RaidDetectionService.processRoleDelete(role, client).catch(err =>
        logger.debug('Error in anti-nuke role delete processing:', err)
      );

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

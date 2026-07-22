import { Events, AuditLogEvent } from 'discord.js';
import { logger } from '../utils/logger.js';
import { checkPermGuard } from '../services/permGuardService.js';

export default {
    name: Events.GuildRoleUpdate,
    once: false,

    async execute(oldRole, newRole, client) {
        try {
            if (!newRole.guild) return;

            await checkPermGuard(
                newRole.guild,
                client,
                AuditLogEvent.RoleUpdate,
                newRole.id,
                `edited role @${newRole.name ?? newRole.id}`
            );
        } catch (error) {
            logger.error('Error in roleUpdate perm guard event:', error);
        }
    },
};

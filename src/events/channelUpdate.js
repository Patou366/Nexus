import { Events, AuditLogEvent } from 'discord.js';
import { logger } from '../utils/logger.js';
import { checkPermGuard } from '../services/permGuardService.js';

export default {
    name: Events.ChannelUpdate,
    once: false,

    async execute(oldChannel, newChannel, client) {
        try {
            if (!newChannel.guild) return;

            // Only check guild text, voice, category, announcement, forum channels
            // (skip DMs and partial channels)
            await checkPermGuard(
                newChannel.guild,
                client,
                AuditLogEvent.ChannelUpdate,
                newChannel.id,
                `edited channel #${newChannel.name ?? newChannel.id}`
            );
        } catch (error) {
            logger.error('Error in channelUpdate perm guard event:', error);
        }
    },
};

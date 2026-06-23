import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getTicketPermissionContext } from '../../utils/ticketPermissions.js';
import { unclaimTicket } from '../../services/ticket.js';

export default {
    data: new SlashCommandBuilder()
        .setName('unclaim')
        .setDescription('Releases your claim on a ticket so other staff can take it.')
        .setDMPermission(false),

    async execute(interaction, guildConfig, client) {
        try {
            const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
            if (!deferred) return;

            const permissionContext = await getTicketPermissionContext({ client, interaction });
            if (!permissionContext.ticketData) {
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('Not a Ticket Channel', 'This command can only be used in a valid ticket channel.')],
                });
            }

            if (!permissionContext.canManageTicket) {
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('Permission Denied', 'You need `Manage Channels` or the configured Ticket Staff Role to unclaim tickets.')],
                });
            }

            const result = await unclaimTicket(interaction.channel, interaction.user);

            if (!result.success) {
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('Could Not Unclaim', result.error || 'This ticket is not currently claimed.')],
                });
            }

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [successEmbed('Ticket Unclaimed', 'The ticket is now available for other staff to claim.')],
            });

            logger.info('Ticket unclaimed', {
                userId: interaction.user.id,
                channelId: interaction.channel.id,
                guildId: interaction.guildId,
            });
        } catch (error) {
            logger.error('Error executing unclaim command', {
                error: error.message,
                userId: interaction.user.id,
                channelId: interaction.channel?.id,
                guildId: interaction.guildId,
            });
            await handleInteractionError(interaction, error, { commandName: 'unclaim', source: 'ticket_unclaim_command' });
        }
    },
};

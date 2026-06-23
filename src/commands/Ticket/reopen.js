import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getTicketPermissionContext } from '../../utils/ticketPermissions.js';
import { reopenTicket } from '../../services/ticket.js';

export default {
    data: new SlashCommandBuilder()
        .setName('reopen')
        .setDescription('Reopens a closed ticket channel.')
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
                    embeds: [errorEmbed('Permission Denied', 'You need `Manage Channels` or the configured Ticket Staff Role to reopen tickets.')],
                });
            }

            const result = await reopenTicket(interaction.channel, interaction.user);

            if (!result.success) {
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('Could Not Reopen', result.error || 'This ticket is not currently closed.')],
                });
            }

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [successEmbed('Ticket Reopened', 'The ticket has been reopened and the user has regained access.')],
            });

            logger.info('Ticket reopened', {
                userId: interaction.user.id,
                channelId: interaction.channel.id,
                guildId: interaction.guildId,
            });
        } catch (error) {
            logger.error('Error executing reopen command', {
                error: error.message,
                userId: interaction.user.id,
                channelId: interaction.channel?.id,
                guildId: interaction.guildId,
            });
            await handleInteractionError(interaction, error, { commandName: 'reopen', source: 'ticket_reopen_command' });
        }
    },
};

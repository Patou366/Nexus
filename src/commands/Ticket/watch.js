import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { errorEmbed, successEmbed, createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getTicketPermissionContext } from '../../utils/ticketPermissions.js';
import { watchTicket, unwatchTicket, getTicketWatchers } from '../../services/ticket.js';

export default {
    data: new SlashCommandBuilder()
        .setName('watch')
        .setDescription('Get notified about activity on a ticket.')
        .setDMPermission(false)
        .addSubcommand(sub =>
            sub.setName('start')
                .setDescription('Start watching this ticket for activity.'))
        .addSubcommand(sub =>
            sub.setName('stop')
                .setDescription('Stop watching this ticket.'))
        .addSubcommand(sub =>
            sub.setName('list')
                .setDescription('List all watchers on this ticket.'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

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

            const sub = interaction.options.getSubcommand();

            if (sub === 'start') {
                const result = await watchTicket(interaction.channel, interaction.user.id);
                if (!result.success) {
                    return await InteractionHelper.safeEditReply(interaction, {
                        embeds: [errorEmbed('Already Watching', result.error || 'You are already watching this ticket.')],
                    });
                }
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [successEmbed('Now Watching', 'You will receive DM notifications for activity on this ticket.')],
                });
            }

            if (sub === 'stop') {
                const result = await unwatchTicket(interaction.channel, interaction.user.id);
                if (!result.success) {
                    return await InteractionHelper.safeEditReply(interaction, {
                        embeds: [errorEmbed('Not Watching', result.error || 'You are not currently watching this ticket.')],
                    });
                }
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [successEmbed('Stopped Watching', 'You will no longer receive notifications for this ticket.')],
                });
            }

            // sub === 'list'
            const watchers = await getTicketWatchers(interaction.guildId, interaction.channel.id);
            if (watchers.length === 0) {
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('No Watchers', 'Nobody is currently watching this ticket.')],
                });
            }

            const fields = watchers.slice(0, 25).map(w => ({
                name: `<@${w.userId}>`,
                value: `Since <t:${Math.floor(new Date(w.addedAt).getTime() / 1000)}:R>`,
                inline: true,
            }));

            const embed = createEmbed({
                title: '👁️ Ticket Watchers',
                description: `${watchers.length} user(s) watching this ticket.`,
                fields,
            });

            return await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        } catch (error) {
            logger.error('Error executing watch command', {
                error: error.message,
                userId: interaction.user.id,
                channelId: interaction.channel?.id,
                guildId: interaction.guildId,
            });
            await handleInteractionError(interaction, error, { commandName: 'watch', source: 'ticket_watch_command' });
        }
    },
};

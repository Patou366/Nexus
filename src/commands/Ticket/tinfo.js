import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { errorEmbed, successEmbed, createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getTicketPermissionContext } from '../../utils/ticketPermissions.js';
import { getTicketStats, getTicketsByUser } from '../../services/ticket.js';

const PRIORITY_EMOJI = {
    none: '⚪', low: '🟢', medium: '🟡', high: '🔴', urgent: '🚨',
};

export default {
    data: new SlashCommandBuilder()
        .setName('tinfo')
        .setDescription('View ticket statistics or a user\'s ticket history.')
        .setDMPermission(false)
        .addSubcommand(sub =>
            sub.setName('stats')
                .setDescription('Show server-wide ticket statistics.'))
        .addSubcommand(sub =>
            sub.setName('user')
                .setDescription('Show tickets for a specific user.')
                .addUserOption(opt =>
                    opt.setName('user')
                        .setDescription('The user to look up.')
                        .setRequired(false)))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    async execute(interaction, guildConfig, client) {
        try {
            const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
            if (!deferred) return;

            const permissionContext = await getTicketPermissionContext({ client, interaction });
            if (!permissionContext.canManageTicket) {
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('Permission Denied', 'You need `Manage Channels` or the configured Ticket Staff Role to use this command.')],
                });
            }

            const sub = interaction.options.getSubcommand();

            if (sub === 'stats') {
                const stats = await getTicketStats(client, interaction.guildId);
                const byPriority = Object.entries(stats.byPriority)
                    .map(([k, v]) => `${PRIORITY_EMOJI[k] || '⚪'} ${k}: **${v}**`)
                    .join('\n') || 'None';

                const embed = createEmbed({
                    title: '📊 Ticket Statistics',
                    fields: [
                        { name: 'Total Tickets', value: stats.total.toString(), inline: true },
                        { name: '🟢 Open', value: stats.open.toString(), inline: true },
                        { name: '🔴 Closed', value: stats.closed.toString(), inline: true },
                        { name: '✅ Claimed', value: stats.claimed.toString(), inline: true },
                        { name: '⏳ Unclaimed', value: stats.unclaimed.toString(), inline: true },
                        { name: '\u200b', value: '\u200b', inline: true },
                        { name: 'Last 24h', value: stats.ticketsLast24h.toString(), inline: true },
                        { name: 'Last 7d', value: stats.ticketsLast7d.toString(), inline: true },
                        { name: 'Last 30d', value: stats.ticketsLast30d.toString(), inline: true },
                        { name: 'Avg Resolution', value: stats.averageResolutionTime !== null ? `${stats.averageResolutionTime} min` : 'N/A', inline: true },
                        { name: 'Avg Response', value: stats.averageResponseTime !== null ? `${stats.averageResponseTime} min` : 'N/A', inline: true },
                        { name: '\u200b', value: '\u200b', inline: true },
                        { name: 'By Priority', value: byPriority, inline: false },
                    ],
                });

                return await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
            }

            // sub === 'user'
            const targetUser = interaction.options.getUser('user') || interaction.user;
            const tickets = await getTicketsByUser(interaction.guildId, targetUser.id);

            if (tickets.length === 0) {
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('No Tickets', `${targetUser} has no tickets on record.`)],
                });
            }

            const fields = tickets.slice(0, 25).map(t => {
                const priority = PRIORITY_EMOJI[t.priority || 'none'] || '⚪';
                const status = t.status === 'closed' ? '🔴 Closed' : '🟢 Open';
                const claimed = t.claimedBy ? `<@${t.claimedBy}>` : 'Unclaimed';
                return {
                    name: `${priority} Ticket #${t.id}`,
                    value: `${status} • Claimed: ${claimed} • Created <t:${Math.floor(new Date(t.createdAt).getTime() / 1000)}:R>`,
                    inline: false,
                };
            });

            const embed = createEmbed({
                title: `🎫 Tickets for ${targetUser.tag}`,
                description: `${tickets.length} ticket(s) on record.`,
                fields,
                thumbnail: { url: targetUser.displayAvatarURL({ size: 64 }) },
            });

            return await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        } catch (error) {
            logger.error('Error executing tinfo command', {
                error: error.message,
                userId: interaction.user.id,
                guildId: interaction.guildId,
            });
            await handleInteractionError(interaction, error, { commandName: 'tinfo', source: 'ticket_info_command' });
        }
    },
};

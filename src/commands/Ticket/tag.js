import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { errorEmbed, successEmbed, createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getTicketPermissionContext } from '../../utils/ticketPermissions.js';
import { addTicketTag, removeTicketTag, getTicketTags } from '../../services/ticket.js';

export default {
    data: new SlashCommandBuilder()
        .setName('tag')
        .setDescription('Manage tags on a ticket.')
        .setDMPermission(false)
        .addSubcommand(sub =>
            sub.setName('add')
                .setDescription('Add a tag to the current ticket.')
                .addStringOption(opt =>
                    opt.setName('name')
                        .setDescription('The tag name (e.g. bug, billing, urgent).')
                        .setRequired(true)
                        .setMaxLength(30)))
        .addSubcommand(sub =>
            sub.setName('remove')
                .setDescription('Remove a tag from the current ticket.')
                .addStringOption(opt =>
                    opt.setName('name')
                        .setDescription('The tag to remove.')
                        .setRequired(true)
                        .setAutocomplete(true)))
        .addSubcommand(sub =>
            sub.setName('list')
                .setDescription('List all tags on the current ticket.'))
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

            if (sub === 'add') {
                const tag = interaction.options.getString('name');
                const result = await addTicketTag(interaction.channel, tag, interaction.user);
                if (!result.success) {
                    return await InteractionHelper.safeEditReply(interaction, {
                        embeds: [errorEmbed('Could Not Add Tag', result.error || 'Failed to add the tag.')],
                    });
                }
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [successEmbed('Tag Added', `Tag \`${result.tag}\` has been added to the ticket.`)],
                });
            }

            if (sub === 'remove') {
                const tag = interaction.options.getString('name');
                const result = await removeTicketTag(interaction.channel, tag, interaction.user);
                if (!result.success) {
                    return await InteractionHelper.safeEditReply(interaction, {
                        embeds: [errorEmbed('Could Not Remove Tag', result.error || 'Failed to remove the tag.')],
                    });
                }
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [successEmbed('Tag Removed', `Tag \`${tag}\` has been removed from the ticket.`)],
                });
            }

            // sub === 'list'
            const tags = await getTicketTags(interaction.guildId, interaction.channel.id);
            if (tags.length === 0) {
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('No Tags', 'This ticket has no tags yet. Use `/tag add` to add one.')],
                });
            }

            const embed = createEmbed({
                title: '🏷️ Ticket Tags',
                description: tags.map(t => `\`${t}\``).join(', '),
            });

            return await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        } catch (error) {
            logger.error('Error executing tag command', {
                error: error.message,
                userId: interaction.user.id,
                channelId: interaction.channel?.id,
                guildId: interaction.guildId,
            });
            await handleInteractionError(interaction, error, { commandName: 'tag', source: 'ticket_tag_command' });
        }
    },

    async autocomplete(interaction) {
        try {
            const focused = interaction.options.getFocused().toLowerCase();
            const tags = await getTicketTags(interaction.guildId, interaction.channel.id);
            const filtered = tags
                .filter(t => t.includes(focused))
                .slice(0, 25)
                .map(t => ({ name: t, value: t }));
            await interaction.respond(filtered);
        } catch {
            await interaction.respond([]);
        }
    },
};

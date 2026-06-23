import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { errorEmbed, successEmbed, createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getTicketPermissionContext } from '../../utils/ticketPermissions.js';
import { addTicketNote, removeTicketNote, getTicketNotes } from '../../services/ticket.js';

export default {
    data: new SlashCommandBuilder()
        .setName('note')
        .setDescription('Manage staff notes on a ticket.')
        .setDMPermission(false)
        .addSubcommand(sub =>
            sub.setName('add')
                .setDescription('Add a note to the current ticket.')
                .addStringOption(opt =>
                    opt.setName('content')
                        .setDescription('The note content.')
                        .setRequired(true)
                        .setMaxLength(1000))
                .addBooleanOption(opt =>
                    opt.setName('internal')
                        .setDescription('If true, only staff can see the note (default: true).')
                        .setRequired(false)))
        .addSubcommand(sub =>
            sub.setName('remove')
                .setDescription('Remove a note by its ID.')
                .addStringOption(opt =>
                    opt.setName('id')
                        .setDescription('The note ID to remove.')
                        .setRequired(true)))
        .addSubcommand(sub =>
            sub.setName('list')
                .setDescription('List all notes on the current ticket.'))
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
                const content  = interaction.options.getString('content');
                const internal = interaction.options.getBoolean('internal') ?? true;

                const result = await addTicketNote(interaction.channel, interaction.user, content, internal);
                if (!result.success) {
                    return await InteractionHelper.safeEditReply(interaction, {
                        embeds: [errorEmbed('Could Not Add Note', result.error || 'Failed to add the note.')],
                    });
                }
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [successEmbed('Note Added', `The note has been added to the ticket.\nNote ID: \`${result.note.id}\``)],
                });
            }

            if (sub === 'remove') {
                const noteId = interaction.options.getString('id');
                const result = await removeTicketNote(interaction.channel, noteId, interaction.user);
                if (!result.success) {
                    return await InteractionHelper.safeEditReply(interaction, {
                        embeds: [errorEmbed('Could Not Remove Note', result.error || 'Failed to remove the note.')],
                    });
                }
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [successEmbed('Note Removed', 'The note has been removed from the ticket.')],
                });
            }

            // sub === 'list'
            const includeInternal = permissionContext.canManageTicket;
            const notes = await getTicketNotes(interaction.guildId, interaction.channel.id, includeInternal);

            if (notes.length === 0) {
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('No Notes', 'There are no notes on this ticket yet.')],
                });
            }

            const fields = notes.slice(0, 25).map(n => ({
                name: `${n.isInternal ? '🔒' : '📝'} \`${n.id}\``,
                value: `${n.content.length > 200 ? n.content.slice(0, 197) + '...' : n.content}\n— <@${n.authorId}> • <t:${Math.floor(new Date(n.createdAt).getTime() / 1000)}:R>`,
                inline: false,
            }));

            const embed = createEmbed({
                title: '📝 Ticket Notes',
                description: `Showing ${notes.length} note(s) on this ticket.`,
                fields,
            });

            return await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        } catch (error) {
            logger.error('Error executing note command', {
                error: error.message,
                userId: interaction.user.id,
                channelId: interaction.channel?.id,
                guildId: interaction.guildId,
            });
            await handleInteractionError(interaction, error, { commandName: 'note', source: 'ticket_note_command' });
        }
    },
};

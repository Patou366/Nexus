import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    MessageFlags,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import { getGuildConfig } from '../../services/guildConfig.js';

export default {
    data: new SlashCommandBuilder()
        .setName('staff-suggestion')
        .setDescription('Submit a staff suggestion / Enviar una sugerencia del staff')
        .addStringOption(option =>
            option
                .setName('suggestion')
                .setDescription('Your suggestion / Tu sugerencia')
                .setRequired(true)
                .setMaxLength(1000)
        )
        .addStringOption(option =>
            option
                .setName('category')
                .setDescription('Category of your suggestion / Categoria de tu sugerencia')
                .setRequired(false)
                .addChoices(
                    { name: '🛡️ Moderation / Moderacion', value: 'moderation' },
                    { name: '🎉 Events / Eventos', value: 'events' },
                    { name: '📋 Rules / Reglas', value: 'rules' },
                    { name: '🤖 Bot / Bot', value: 'bot' },
                    { name: '💬 Channels / Canales', value: 'channels' },
                    { name: '🎭 Roles', value: 'roles' },
                    { name: '📢 Announcements / Anuncios', value: 'announcements' },
                    { name: '❓ Other / Otro', value: 'other' }
                )
        ),

    async execute(interaction, guildConfig, client) {
        await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

        const config = guildConfig || await getGuildConfig(client, interaction.guild.id);
        const modRole = config?.modRole;
        const adminRole = config?.adminRole;
        const channelId = config?.staffSuggestionChannelId;

        const isAdmin =
            interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
            (adminRole && interaction.member.roles.cache.has(adminRole));

        const isMod =
            isAdmin ||
            (modRole && interaction.member.roles.cache.has(modRole));

        if (!isMod) {
            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [createEmbed({
                    title: 'Permission Denied / Permiso Denegado',
                    description: 'You need a Moderator or Admin role to submit staff suggestions.\nNecesitas un rol de Moderador o Administrador para enviar sugerencias del staff.',
                    color: 'error'
                })],
                flags: MessageFlags.Ephemeral
            });
        }

        if (!channelId) {
            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [createEmbed({
                    title: 'No Channel Configured / Canal No Configurado',
                    description: 'No staff suggestion channel has been set up yet.\nAsk an admin to use `/suggestion-set-channel` first.\n\nNo se ha configurado un canal de sugerencias del staff todavia.\nPide a un administrador que use `/suggestion-set-channel` primero.',
                    color: 'warning'
                })],
                flags: MessageFlags.Ephemeral
            });
        }

        const suggestionChannel = interaction.guild.channels.cache.get(channelId);
        if (!suggestionChannel) {
            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [createEmbed({
                    title: 'Channel Not Found / Canal No Encontrado',
                    description: 'The configured suggestion channel no longer exists. Ask an admin to reconfigure it with `/suggestion-set-channel`.\n\nEl canal de sugerencias configurado ya no existe. Pide a un administrador que lo reconfigure con `/suggestion-set-channel`.',
                    color: 'error'
                })],
                flags: MessageFlags.Ephemeral
            });
        }

        const suggestion = interaction.options.getString('suggestion');
        const category = interaction.options.getString('category');

        const categoryLabels = {
            moderation: '🛡️ Moderation / Moderacion',
            events: '🎉 Events / Eventos',
            rules: '📋 Rules / Reglas',
            bot: '🤖 Bot',
            channels: '💬 Channels / Canales',
            roles: '🎭 Roles',
            announcements: '📢 Announcements / Anuncios',
            other: '❓ Other / Otro'
        };

        const roleLabel = isAdmin ? '👑 Admin' : '🛡️ Moderator / Moderador';

        const fields = [
            { name: 'Submitted by / Enviado por', value: `${interaction.user} (\`${interaction.user.tag}\`)`, inline: true },
            { name: 'Role / Rol', value: roleLabel, inline: true }
        ];

        if (category) {
            fields.push({ name: 'Category / Categoria', value: categoryLabels[category] || category, inline: true });
        }

        // Vote count display fields
        fields.push(
            { name: '👍 Support / Apoyar', value: '**0** votes', inline: true },
            { name: '👎 Oppose / Oponerse', value: '**0** votes', inline: true },
            { name: '🤔 Neutral', value: '**0** votes', inline: true },
            // Hidden voter tracking field — stores "u:id1,id2|d:id3|n:id4" to prevent double votes
            { name: '\u200b', value: 'u:|d:|n:', inline: false }
        );

        const suggestionEmbed = createEmbed({
            title: '📝 Staff Suggestion / Sugerencia del Staff',
            description: suggestion,
            color: 'primary',
            fields,
            timestamp: true
        });

        suggestionEmbed.setFooter({
            text: `Staff Suggestion • ${interaction.user.tag}`,
            iconURL: interaction.user.displayAvatarURL({ dynamic: true })
        });

        const voteRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('staff_suggestion_upvote')
                .setLabel('👍 Support / Apoyar (0)')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId('staff_suggestion_downvote')
                .setLabel('👎 Oppose / Oponerse (0)')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId('staff_suggestion_neutral')
                .setLabel('🤔 Neutral (0)')
                .setStyle(ButtonStyle.Secondary)
        );

        try {
            const postedMessage = await suggestionChannel.send({
                embeds: [suggestionEmbed],
                components: [voteRow]
            });

            await postedMessage.pin().catch(() => null);

            logger.info(`Staff suggestion posted by ${interaction.user.id} in channel ${channelId} in guild ${interaction.guild.id}`);

            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [createEmbed({
                    title: '✅ Suggestion Submitted / Sugerencia Enviada',
                    description: `Your suggestion has been posted in ${suggestionChannel}.\nTu sugerencia ha sido publicada en ${suggestionChannel}.`,
                    color: 'success'
                })],
                flags: MessageFlags.Ephemeral
            });
        } catch (error) {
            logger.error('Error posting staff suggestion:', error);
            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [createEmbed({
                    title: 'Error',
                    description: 'Failed to post your suggestion. Make sure I have permission to send messages in the suggestion channel.\n\nFallo al publicar tu sugerencia. Asegurate de que tengo permiso para enviar mensajes en el canal de sugerencias.',
                    color: 'error'
                })],
                flags: MessageFlags.Ephemeral
            });
        }
    }
};

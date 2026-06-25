import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType,
    MessageFlags
} from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import { getGuildConfig, setGuildConfig } from '../../services/guildConfig.js';

export default {
    data: new SlashCommandBuilder()
        .setName('suggestion-set-channel')
        .setDescription('Set the channel for staff suggestions / Establecer el canal para sugerencias del staff')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption(option =>
            option
                .setName('channel')
                .setDescription('The channel where staff suggestions will be posted / El canal donde se publicaran las sugerencias del staff')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true)
        ),

    async execute(interaction, guildConfig, client) {
        await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

        const config = guildConfig || await getGuildConfig(client, interaction.guild.id);
        const adminRole = config?.adminRole;

        const isAdmin =
            interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
            (adminRole && interaction.member.roles.cache.has(adminRole));

        if (!isAdmin) {
            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [createEmbed({
                    title: 'Permission Denied / Permiso Denegado',
                    description: 'You need Administrator permission to use this command.\nNecesitas permiso de Administrador para usar este comando.',
                    color: 'error'
                })],
                flags: MessageFlags.Ephemeral
            });
        }

        const channel = interaction.options.getChannel('channel');

        try {
            await setGuildConfig(client, interaction.guild.id, {
                ...config,
                staffSuggestionChannelId: channel.id
            });

            logger.info(`Staff suggestion channel set to ${channel.id} (${channel.name}) in guild ${interaction.guild.id} by ${interaction.user.id}`);

            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [createEmbed({
                    title: 'Suggestion Channel Set / Canal de Sugerencias Establecido',
                    description: `Staff suggestions will now be posted in ${channel}.\nLas sugerencias del staff ahora se publicaran en ${channel}.`,
                    color: 'success',
                    fields: [
                        { name: 'Channel / Canal', value: `${channel} (\`${channel.id}\`)`, inline: true }
                    ]
                })],
                flags: MessageFlags.Ephemeral
            });
        } catch (error) {
            logger.error('Error in suggestion-set-channel command:', error);
            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [createEmbed({
                    title: 'Error',
                    description: 'Failed to save the suggestion channel. Please try again.\nFallo al guardar el canal de sugerencias. Intentalo de nuevo.',
                    color: 'error'
                })],
                flags: MessageFlags.Ephemeral
            });
        }
    }
};

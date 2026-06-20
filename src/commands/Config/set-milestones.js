import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType,
    MessageFlags
} from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import { getFromDb, setInDb } from '../../utils/database.js';

export default {
    data: new SlashCommandBuilder()
        .setName("set-milestones")
        .setDescription("Set the channel for milestone announcements")
        .addChannelOption(option =>
            option
                .setName('channel')
                .setDescription('Milestone announcement channel / Canal para anuncios de hitos')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction, guildConfig, client) {
        const { MessageFlags } = await import('discord.js');
        await InteractionHelper.safeDefer(interaction);

        const channel = interaction.options.getChannel('channel');
        const guildId = interaction.guild.id;

        // Verify the bot has permissions to send messages in the channel
        const botPermissions = channel.permissionsFor(client.user);
        if (!botPermissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
            const errorEmbed = createEmbed({
                title: 'Permission Error / Error de Permiso',
                description: 'I do not have permission to send messages or embeds in that channel. / No tengo permiso para enviar mensajes o embeds en ese canal.',
                color: 'error'
            });
            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed],
                flags: MessageFlags.Ephemeral
            });
        }

        // Save the milestone channel to the database
        const configKey = `milestones:${guildId}:config`;
        const milestoneConfig = await getFromDb(configKey, { enabled: true, channelId: null });
        milestoneConfig.channelId = channel.id;
        milestoneConfig.enabled = true;
        milestoneConfig.lastMilestone = milestoneConfig.lastMilestone || 0;

        await setInDb(configKey, milestoneConfig);

        logger.info(`Milestone channel set to ${channel.id} for guild ${guildId}`);

        const successEmbed = createEmbed({
            title: 'Milestone Channel Set / Canal de Hitos Configurado',
            description: `Milestone announcements will now be posted in ${channel}.\n\n` +
                `Los anuncios de hitos ahora se publicaran en ${channel}.`,
            color: 'success'
        });

        successEmbed.addFields(
            {
                name: 'Channel / Canal',
                value: `<#${channel.id}>`,
                inline: true
            },
            {
                name: 'Status / Estado',
                value: 'Enabled / Habilitado',
                inline: true
            }
        );

        successEmbed.setFooter({ text: 'Milestones are celebrated every 100 members / Los hitos se celebran cada 100 miembros' });

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [successEmbed]
        });
    },
};

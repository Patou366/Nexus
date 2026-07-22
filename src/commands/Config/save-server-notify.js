import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ChannelType, MessageFlags } from 'discord.js';
import { getColor } from '../../config/bot.js';
import { logger } from '../../utils/logger.js';
import { errorEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { guardDefer, guardPermission } from '../../utils/commandGuards.js';
import { getAutoSaveConfig, setAutoSaveConfig } from '../../services/autoSaveService.js';

export default {
    data: new SlashCommandBuilder()
        .setName('save-server-notify')
        .setDescription('Set the auto-save notification channel / Canal de notificaciones de respaldo automático')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(sub =>
            sub
                .setName('set')
                .setDescription('Set the channel for auto-save notifications / Establecer canal de notificaciones')
                .addChannelOption(opt =>
                    opt
                        .setName('channel')
                        .setDescription('The channel to send backup notifications to / El canal para enviar notificaciones de respaldo')
                        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                        .setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub
                .setName('clear')
                .setDescription('Disable auto-save notifications / Desactivar notificaciones de respaldo automático')
        )
        .addSubcommand(sub =>
            sub
                .setName('status')
                .setDescription('View current auto-save notification settings / Ver configuración actual de notificaciones')
        ),

    async execute(interaction, config, client) {
        if (!await guardDefer(interaction, 'save-server-notify')) return;

        try {
            guardPermission(interaction, PermissionFlagsBits.Administrator, 'Administrator');

            const sub = interaction.options.getSubcommand();
            const { guild } = interaction;

            if (sub === 'set') {
                const channel = interaction.options.getChannel('channel');

                // Check bot can send in that channel
                const me = guild.members.me;
                if (!me?.permissionsIn(channel).has(['ViewChannel', 'SendMessages', 'EmbedLinks'])) {
                    return await InteractionHelper.safeEditReply(interaction, {
                        embeds: [errorEmbed(
                            'Missing Permissions / Permisos Insuficientes',
                            `I need **View Channel**, **Send Messages**, and **Embed Links** permissions in ${channel}.\n` +
                            `Necesito permisos de **Ver Canal**, **Enviar Mensajes** y **Insertar Vínculos** en ${channel}.`
                        )],
                    });
                }

                const ok = await setAutoSaveConfig(client, guild.id, { channelId: channel.id });
                if (!ok) {
                    return await InteractionHelper.safeEditReply(interaction, {
                        embeds: [errorEmbed(
                            'Save Failed / Error al Guardar',
                            'Could not save the configuration. Please try again.\n' +
                            'No se pudo guardar la configuración. Por favor intenta de nuevo.'
                        )],
                    });
                }

                logger.info(`[AutoSave] Notification channel set to ${channel.id} in guild ${guild.id} by ${interaction.user.tag}`);

                const embed = new EmbedBuilder()
                    .setColor(getColor('success'))
                    .setTitle('✅ Auto-Save Notifications Configured / Notificaciones de Respaldo Configuradas')
                    .setDescription(
                        `Automatic backup notifications will now be sent to ${channel}.\n` +
                        `The server is automatically backed up every **3 days**.\n\n` +
                        `Las notificaciones de respaldo automático se enviarán ahora a ${channel}.\n` +
                        `El servidor se respalda automáticamente cada **3 días**.`
                    )
                    .setTimestamp();

                return await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
            }

            if (sub === 'clear') {
                await setAutoSaveConfig(client, guild.id, { channelId: null });

                logger.info(`[AutoSave] Notification channel cleared in guild ${guild.id} by ${interaction.user.tag}`);

                const embed = new EmbedBuilder()
                    .setColor(getColor('warning'))
                    .setTitle('🔕 Notifications Disabled / Notificaciones Desactivadas')
                    .setDescription(
                        'Auto-save notifications have been disabled. The server will still be backed up every 3 days, but no message will be sent.\n\n' +
                        'Las notificaciones de respaldo automático han sido desactivadas. El servidor seguirá siendo respaldado cada 3 días, pero no se enviará ningún mensaje.'
                    )
                    .setTimestamp();

                return await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
            }

            if (sub === 'status') {
                const cfg = await getAutoSaveConfig(client, guild.id);

                const channelMention = cfg.channelId
                    ? `<#${cfg.channelId}>`
                    : 'Not set / No configurado';

                const lastSave = cfg.lastSaveAt
                    ? `<t:${Math.floor(cfg.lastSaveAt / 1000)}:F> (<t:${Math.floor(cfg.lastSaveAt / 1000)}:R>)`
                    : 'Never / Nunca';

                const nextSave = cfg.lastSaveAt
                    ? `<t:${Math.floor((cfg.lastSaveAt + 3 * 24 * 60 * 60 * 1000) / 1000)}:R>`
                    : 'Within 24 hours / Dentro de 24 horas';

                const embed = new EmbedBuilder()
                    .setColor(getColor('info'))
                    .setTitle('🔒 Auto-Save Status / Estado del Respaldo Automático')
                    .addFields(
                        { name: '📢 Notification Channel / Canal de Notificaciones', value: channelMention, inline: false },
                        { name: '🕐 Last Auto-Save / Último Respaldo', value: lastSave, inline: true },
                        { name: '⏭️ Next Auto-Save / Próximo Respaldo', value: nextSave, inline: true },
                    )
                    .setFooter({ text: 'Auto-saves run every 3 days · Los respaldos automáticos se ejecutan cada 3 días' })
                    .setTimestamp();

                return await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
            }

        } catch (error) {
            logger.error('[AutoSave] Error in save-server-notify command:', error);
            await handleInteractionError(interaction, error, {
                type: 'command',
                commandName: 'save-server-notify'
            });
        }
    },
};

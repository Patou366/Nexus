import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } from 'discord.js';
import { errorEmbed, successEmbed, infoEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import { RaidDetectionService } from '../../services/raidDetectionService.js';
import { QuarantineService } from '../../services/quarantineService.js';
import { AiModerationService } from '../../services/aiModerationService.js';

export default {
  data: new SlashCommandBuilder()
    .setName('raidshield')
    .setDescription('Configure the Raid Shield & Auto-Quarantine system')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub
        .setName('dashboard')
        .setDescription('View current Raid Shield configuration')
    )
    .addSubcommand(sub =>
      sub
        .setName('channel')
        .setDescription('Set the quarantine notification channel')
        .addChannelOption(opt =>
          opt
            .setName('channel')
            .setDescription('Channel for staff quarantine alerts')
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('roles')
        .setDescription('Configure quarantine and verified roles')
        .addRoleOption(opt =>
          opt
            .setName('verified')
            .setDescription('The verified role to strip during quarantine')
            .setRequired(false)
        )
        .addRoleOption(opt =>
          opt
            .setName('quarantine')
            .setDescription('The quarantine role to assign to suspects')
            .setRequired(false)
        )
        .addRoleOption(opt =>
          opt
            .setName('alert')
            .setDescription('The role to ping when a raid is detected')
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('toggle')
        .setDescription('Enable or disable the Raid Shield')
        .addBooleanOption(opt =>
          opt
            .setName('enabled')
            .setDescription('Turn raid shield on or off')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('history')
        .setDescription('View recent quarantine events')
    )
    .addSubcommand(sub =>
      sub
        .setName('ai')
        .setDescription('Enable or disable AI message & image analysis')
        .addBooleanOption(opt =>
          opt
            .setName('enabled')
            .setDescription('Turn AI moderation on or off')
            .setRequired(true)
        )
        .addBooleanOption(opt =>
          opt
            .setName('scan-images')
            .setDescription('Whether to scan image attachments (default: true)')
            .setRequired(false)
        )
        .addNumberOption(opt =>
          opt
            .setName('confidence')
            .setDescription('Minimum confidence to act (0.5-1.0, default: 0.80)')
            .setRequired(false)
            .setMinValue(0.5)
            .setMaxValue(1.0)
        )
        .addChannelOption(opt =>
          opt
            .setName('alert-channel')
            .setDescription('Channel for AI moderation alerts (defaults to raid shield channel)')
            .setRequired(false)
            .addChannelTypes(ChannelType.GuildText)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('ai-action')
        .setDescription('Set what action to take when AI detects a threat')
        .addStringOption(opt =>
          opt
            .setName('threat-type')
            .setDescription('The type of threat to configure')
            .setRequired(true)
            .addChoices(
              { name: 'Spam', value: 'spam' },
              { name: 'Bot', value: 'bot' },
              { name: 'Raid', value: 'raid' }
            )
        )
        .addStringOption(opt =>
          opt
            .setName('action')
            .setDescription('The action to take when this threat is detected')
            .setRequired(true)
            .addChoices(
              { name: 'Quarantine (default)', value: 'quarantine' },
              { name: 'Kick', value: 'kick' },
              { name: 'Ban', value: 'ban' },
              { name: 'Timeout (10 min)', value: 'timeout' },
              { name: 'Delete message only', value: 'delete' }
            )
        )
    ),

  category: 'moderation',

  async execute(interaction, config, client) {
    try {
      const subcommand = interaction.options.getSubcommand();
      const guildId = interaction.guild.id;

      if (subcommand === 'dashboard') {
        const raidConfig = await RaidDetectionService.getRaidConfig(client, guildId);
        const aiConfig = await AiModerationService.getAiConfig(client, guildId);
        const notificationChannel = raidConfig.notificationChannelId
          ? `<#${raidConfig.notificationChannelId}>`
          : 'Not set / No configurado';
        const verifiedRole = raidConfig.verifiedRoleId
          ? `<@&${raidConfig.verifiedRoleId}>`
          : 'Not set / No configurado';
        const quarantineRole = raidConfig.quarantineRoleId
          ? `<@&${raidConfig.quarantineRoleId}>`
          : 'Not set / No configurado';
        const alertRole = raidConfig.alertRoleId
          ? `<@&${raidConfig.alertRoleId}>`
          : 'Not set / No configurado';
        const status = raidConfig.enabled
          ? '✅ Enabled / Activado'
          : '❌ Disabled / Desactivado';

        const aiStatus = aiConfig.enabled
          ? '✅ Enabled / Activado'
          : '❌ Disabled / Desactivado';
        const aiImageScan = aiConfig.scanImages ? 'On / Activado' : 'Off / Desactivado';
        const aiConfidence = `${Math.round(aiConfig.confidenceThreshold * 100)}%`;
        const aiAlertCh = aiConfig.alertChannelId
          ? `<#${aiConfig.alertChannelId}>`
          : 'Same as Raid Shield / Igual que Escudo';
        const aiActions = `Spam: ${aiConfig.actions.spam}, Bot: ${aiConfig.actions.bot}, Raid: ${aiConfig.actions.raid}`;

        const embed = infoEmbed(
          `**Status:** ${status}\n\n**Notification Channel:** ${notificationChannel}\n**Verified Role:** ${verifiedRole}\n**Quarantine Role:** ${quarantineRole}\n**Alert Role:** ${alertRole}\n\n**--- AI Moderation / Moderación IA ---**\n**AI Status:** ${aiStatus}\n**Image Scanning:** ${aiImageScan}\n**Confidence Threshold:** ${aiConfidence}\n**AI Alert Channel:** ${aiAlertCh}\n**AI Actions:** ${aiActions}`,
          '🔒 Raid Shield Configuration / Configuración del Escudo Anti-Raid'
        );

        await InteractionHelper.universalReply(interaction, { embeds: [embed] });
        return;
      }

      if (subcommand === 'channel') {
        const channel = interaction.options.getChannel('channel');
        if (!channel?.isTextBased()) {
          await InteractionHelper.universalReply(interaction, {
            embeds: [errorEmbed('❌ Invalid Channel / Canal Inválido', 'Please select a text channel.\n\nPor favor selecciona un canal de texto.')]
          });
          return;
        }

        await RaidDetectionService.saveRaidConfig(client, guildId, {
          notificationChannelId: channel.id
        });

        await InteractionHelper.universalReply(interaction, {
          embeds: [successEmbed(
            `Quarantine alerts will be sent to ${channel}.\n\nLas alertas de cuarentena se enviarán a ${channel}.`,
            '✅ Channel Set / Canal Configurado'
          )]
        });
        logger.info(`Raid shield notification channel set to ${channel.id} in guild ${guildId}`);
        return;
      }

      if (subcommand === 'roles') {
        const verifiedRole = interaction.options.getRole('verified');
        const quarantineRole = interaction.options.getRole('quarantine');
        const alertRole = interaction.options.getRole('alert');
        const updates = {};

        if (verifiedRole) updates.verifiedRoleId = verifiedRole.id;
        if (quarantineRole) updates.quarantineRoleId = quarantineRole.id;
        if (alertRole) updates.alertRoleId = alertRole.id;

        if (Object.keys(updates).length === 0) {
          await InteractionHelper.universalReply(interaction, {
            embeds: [infoEmbed(
              'No changes were made. Provide at least one role to update.\n\nNo se realizaron cambios. Proporciona al menos un rol para actualizar.',
              'ℹ️ No Changes / Sin Cambios'
            )]
          });
          return;
        }

        await RaidDetectionService.saveRaidConfig(client, guildId, updates);

        const fields = [];
        if (verifiedRole) fields.push(`Verified: ${verifiedRole}`);
        if (quarantineRole) fields.push(`Quarantine: ${quarantineRole}`);
        if (alertRole) fields.push(`Alert: ${alertRole}`);

        await InteractionHelper.universalReply(interaction, {
          embeds: [successEmbed(
            `Roles updated:\n${fields.join('\n')}\n\nRoles actualizados:\n${fields.join('\n')}`,
            '✅ Roles Updated / Roles Actualizados'
          )]
        });
        logger.info(`Raid shield roles updated in guild ${guildId}`, updates);
        return;
      }

      if (subcommand === 'toggle') {
        const enabled = interaction.options.getBoolean('enabled');
        await RaidDetectionService.saveRaidConfig(client, guildId, { enabled });

        const statusText = enabled
          ? 'The Raid Shield is now active and will monitor for raid patterns.\n\nEl Escudo Anti-Raid está activo y monitoreará patrones de raid.'
          : 'The Raid Shield has been disabled.\n\nEl Escudo Anti-Raid ha sido desactivado.';

        await InteractionHelper.universalReply(interaction, {
          embeds: [successEmbed(statusText, enabled ? '✅ Enabled / Activado' : '❌ Disabled / Desactivado')]
        });
        logger.info(`Raid shield ${enabled ? 'enabled' : 'disabled'} in guild ${guildId}`);
        return;
      }

      if (subcommand === 'ai') {
        const enabled = interaction.options.getBoolean('enabled');
        const scanImages = interaction.options.getBoolean('scan-images');
        const confidence = interaction.options.getNumber('confidence');
        const alertChannel = interaction.options.getChannel('alert-channel');

        const updates = { enabled };
        if (scanImages !== null) updates.scanImages = scanImages;
        if (confidence !== null) updates.confidenceThreshold = confidence;
        if (alertChannel) updates.alertChannelId = alertChannel.id;

        await AiModerationService.saveAiConfig(client, guildId, updates);

        const details = [`**AI Moderation:** ${enabled ? '✅ Enabled' : '❌ Disabled'}`];
        if (scanImages !== null) details.push(`**Image Scanning:** ${scanImages ? 'On' : 'Off'}`);
        if (confidence !== null) details.push(`**Confidence Threshold:** ${Math.round(confidence * 100)}%`);
        if (alertChannel) details.push(`**Alert Channel:** ${alertChannel}`);

        if (enabled && !process.env.OPENAI_API_KEY) {
          details.push('\n⚠️ **Warning:** `OPENAI_API_KEY` environment variable is not set. AI moderation will not work until it is configured.\n⚠️ **Advertencia:** La variable de entorno `OPENAI_API_KEY` no está configurada.');
        }

        await InteractionHelper.universalReply(interaction, {
          embeds: [successEmbed(
            details.join('\n') + '\n\n' + details.map(d => d.replace('Enabled', 'Activado').replace('Disabled', 'Desactivado').replace('Image Scanning', 'Escaneo de Imágenes').replace('Confidence Threshold', 'Umbral de Confianza').replace('Alert Channel', 'Canal de Alertas').replace('On', 'Activado').replace('Off', 'Desactivado')).join('\n'),
            '🤖 AI Moderation / Moderación IA'
          )]
        });
        logger.info(`AI moderation ${enabled ? 'enabled' : 'disabled'} in guild ${guildId}`);
        return;
      }

      if (subcommand === 'ai-action') {
        const threatType = interaction.options.getString('threat-type');
        const action = interaction.options.getString('action');

        await AiModerationService.saveAiConfig(client, guildId, {
          actions: { [threatType]: action }
        });

        const actionLabels = {
          quarantine: 'Quarantine / Cuarentena',
          kick: 'Kick / Expulsar',
          ban: 'Ban / Banear',
          timeout: 'Timeout (10 min) / Silenciar (10 min)',
          delete: 'Delete Message / Eliminar Mensaje'
        };

        await InteractionHelper.universalReply(interaction, {
          embeds: [successEmbed(
            `When AI detects **${threatType}**, the action will be: **${actionLabels[action]}**\n\nCuando la IA detecte **${threatType}**, la acción será: **${actionLabels[action]}**`,
            '✅ AI Action Updated / Acción IA Actualizada'
          )]
        });
        logger.info(`AI moderation action for ${threatType} set to ${action} in guild ${guildId}`);
        return;
      }

      if (subcommand === 'history') {
        const quarantines = await QuarantineService.getGuildQuarantines(client, guildId, 10);
        if (quarantines.length === 0) {
          await InteractionHelper.universalReply(interaction, {
            embeds: [infoEmbed(
              'No quarantine events found for this server.\n\nNo se encontraron eventos de cuarentena para este servidor.',
              'ℹ️ No History / Sin Historial'
            )]
          });
          return;
        }

        const lines = quarantines.map((q, i) => {
          const date = q.createdAt ? `<t:${Math.floor(new Date(q.createdAt).getTime() / 1000)}:R>` : 'N/A';
          const statusEmoji = q.status === 'quarantined' ? '🔒' : q.status === 'banned' ? '🚫' : '✅';
          const reasonMap = {
            raid_join_burst: 'Join Burst',
            raid_cross_channel_spam: 'Cross-Channel Spam',
            raid_suspicious_subset: 'Suspicious Accounts',
            raid_name_pattern: 'Name Pattern',
            raid_name_similarity: 'Name Similarity',
            ai_spam: 'AI: Spam',
            ai_bot: 'AI: Bot',
            ai_raid: 'AI: Raid'
          };
          const reason = reasonMap[q.reason] || q.reason || 'Unknown';
          return `\`${i + 1}.\` ${statusEmoji} **${reason}** — ${date} — ${q.suspects.length} suspects`;
        }).join('\n');

        const embed = infoEmbed(
          lines,
          '📋 Quarantine History / Historial de Cuarentenas'
        );

        await InteractionHelper.universalReply(interaction, { embeds: [embed] });
        return;
      }
    } catch (error) {
      logger.error('Raid shield command error:', error);
      await InteractionHelper.universalReply(interaction, {
        embeds: [errorEmbed('❌ Error', 'An error occurred while processing the command.\n\nOcurrió un error al procesar el comando.')]
      });
    }
  }
};

import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } from 'discord.js';
import { errorEmbed, successEmbed, infoEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import { RaidDetectionService } from '../../services/raidDetectionService.js';
import { QuarantineService } from '../../services/quarantineService.js';

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
    ),

  category: 'moderation',

  async execute(interaction, config, client) {
    try {
      const subcommand = interaction.options.getSubcommand();
      const guildId = interaction.guild.id;

      if (subcommand === 'dashboard') {
        const raidConfig = await RaidDetectionService.getRaidConfig(client, guildId);
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

        const embed = infoEmbed(
          `**Status:** ${status}\n\n**Notification Channel:** ${notificationChannel}\n**Verified Role:** ${verifiedRole}\n**Quarantine Role:** ${quarantineRole}\n**Alert Role:** ${alertRole}`,
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
          const reason = q.reason === 'raid_join_burst' ? 'Join Burst' : 'Cross-Channel Spam';
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

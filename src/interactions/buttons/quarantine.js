import { MessageFlags, PermissionFlagsBits } from 'discord.js';
import { errorEmbed, successEmbed, createEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import { QuarantineService } from '../../services/quarantineService.js';
import { RaidDetectionService } from '../../services/raidDetectionService.js';

const quarantineBanAllHandler = {
  name: 'quarantine_ban_all',
  async execute(interaction, client) {
    try {
      const [, quarantineId] = interaction.customId.split(':');
      if (!quarantineId) {
        return await interaction.reply({
          embeds: [errorEmbed('❌ Error', 'Invalid quarantine ID.')],
          flags: MessageFlags.Ephemeral
        });
      }

      const quarantineData = await QuarantineService.getQuarantine(quarantineId);
      if (!quarantineData) {
        return await interaction.reply({
          embeds: [errorEmbed(
            '❌ Quarantine Not Found / Cuarentena No Encontrada',
            'The quarantine record could not be found.\n\nEl registro de cuarentena no pudo ser encontrado.'
          )],
          flags: MessageFlags.Ephemeral
        });
      }

      if (quarantineData.status !== 'quarantined') {
        return await interaction.reply({
          embeds: [errorEmbed(
            '❌ Already Resolved / Ya Resuelto',
            'This quarantine has already been resolved.\n\nEsta cuarentena ya ha sido resuelta.'
          )],
          flags: MessageFlags.Ephemeral
        });
      }

      const config = await RaidDetectionService.getRaidConfig(client, interaction.guild.id);
      const canManage = await QuarantineService.canManageQuarantine(interaction, config);
      if (!canManage) {
        return await interaction.reply({
          embeds: [errorEmbed(
            '🚫 Permission Denied / Permiso Denegado',
            'You need Administrator or Ban Members permission to perform this action.\n\nNecesitas permiso de Administrador o Banear Miembros para realizar esta acción.'
          )],
          flags: MessageFlags.Ephemeral
        });
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const result = await QuarantineService.banAll({
        quarantineId,
        guild: interaction.guild,
        moderator: interaction.member,
        client,
        deleteDays: 1
      });

      if (result.success) {
        await interaction.editReply({
          embeds: [successEmbed(
            `🚫 Banned ${result.bannedCount} user(s) / Baneado(s) ${result.bannedCount} usuario(s)`,
            result.failedCount > 0
              ? `Failed to ban ${result.failedCount} user(s). / Falló al banear ${result.failedCount} usuario(s).`
              : 'All quarantined users have been banned.\n\nTodos los usuarios en cuarentena han sido baneados.'
          )]
        });

        // Update the original message to disable buttons
        try {
          await interaction.message.edit({
            components: []
          });
        } catch (e) {
          logger.debug('Could not edit original alert message:', e.message);
        }
      } else {
        await interaction.editReply({
          embeds: [errorEmbed('❌ Ban Failed / Falló el Ban', 'Failed to ban quarantined users.\n\nFalló al banear usuarios en cuarentena.')]
        });
      }
    } catch (error) {
      logger.error('Quarantine ban all button error:', error);
      await InteractionHelper.safeReply(interaction, {
        embeds: [errorEmbed('❌ Error', 'An error occurred while processing the ban action.\n\nOcurrió un error al procesar la acción de ban.')]
      });
    }
  }
};

const quarantineFalseAlarmHandler = {
  name: 'quarantine_false_alarm',
  async execute(interaction, client) {
    try {
      const [, quarantineId] = interaction.customId.split(':');
      if (!quarantineId) {
        return await interaction.reply({
          embeds: [errorEmbed('❌ Error', 'Invalid quarantine ID.')],
          flags: MessageFlags.Ephemeral
        });
      }

      const quarantineData = await QuarantineService.getQuarantine(quarantineId);
      if (!quarantineData) {
        return await interaction.reply({
          embeds: [errorEmbed(
            '❌ Quarantine Not Found / Cuarentena No Encontrada',
            'The quarantine record could not be found.\n\nEl registro de cuarentena no pudo ser encontrado.'
          )],
          flags: MessageFlags.Ephemeral
        });
      }

      if (quarantineData.status !== 'quarantined') {
        return await interaction.reply({
          embeds: [errorEmbed(
            '❌ Already Resolved / Ya Resuelto',
            'This quarantine has already been resolved.\n\nEsta cuarentena ya ha sido resuelta.'
          )],
          flags: MessageFlags.Ephemeral
        });
      }

      const config = await RaidDetectionService.getRaidConfig(client, interaction.guild.id);
      const canManage = await QuarantineService.canManageQuarantine(interaction, config);
      if (!canManage) {
        return await interaction.reply({
          embeds: [errorEmbed(
            '🚫 Permission Denied / Permiso Denegado',
            'You need Administrator or Ban Members permission to perform this action.\n\nNecesitas permiso de Administrador o Banear Miembros para realizar esta acción.'
          )],
          flags: MessageFlags.Ephemeral
        });
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const result = await QuarantineService.resolveFalseAlarm({
        quarantineId,
        guild: interaction.guild,
        moderator: interaction.member,
        client
      });

      if (result.success) {
        await interaction.editReply({
          embeds: [successEmbed(
            `✅ Restored ${result.restoredCount} user(s) / Restaurado(s) ${result.restoredCount} usuario(s)`,
            result.failedCount > 0
              ? `Failed to restore ${result.failedCount} user(s). / Falló al restaurar ${result.failedCount} usuario(s).`
              : 'All quarantined users have been released and their roles restored.\n\nTodos los usuarios en cuarentena han sido liberados y sus roles restaurados.'
          )]
        });

        // Update the original message to disable buttons
        try {
          await interaction.message.edit({
            components: []
          });
        } catch (e) {
          logger.debug('Could not edit original alert message:', e.message);
        }
      } else {
        await interaction.editReply({
          embeds: [errorEmbed('❌ Restore Failed / Falló la Restauración', 'Failed to restore quarantined users.\n\nFalló al restaurar usuarios en cuarentena.')]
        });
      }
    } catch (error) {
      logger.error('Quarantine false alarm button error:', error);
      await InteractionHelper.safeReply(interaction, {
        embeds: [errorEmbed('❌ Error', 'An error occurred while processing the false alarm action.\n\nOcurrió un error al procesar la acción de falsa alarma.')]
      });
    }
  }
};

export default [quarantineBanAllHandler, quarantineFalseAlarmHandler];

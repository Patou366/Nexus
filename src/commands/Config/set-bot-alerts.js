import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { setBotAlertsConfig, disableBotAlerts, getBotAlertsConfig } from '../../services/scamDetectionService.js';

export default {
  data: new SlashCommandBuilder()
    .setName('set-bot-alerts')
    .setDescription('Configure the bot alert role for scam detection')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(subcommand =>
      subcommand
        .setName('set')
        .setDescription('Set the alert role and optional channel')
        .addRoleOption(option =>
          option
            .setName('role')
            .setDescription('The role to ping when scams are detected')
            .setRequired(true)
        )
        .addChannelOption(option =>
          option
            .setName('channel')
            .setDescription('The channel to send alerts to (defaults to current channel)')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('disable')
        .setDescription('Disable bot alerts')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('view')
        .setDescription('View current bot alert configuration')
    ),

  async execute(interaction, client) {
    try {
      const subcommand = interaction.options.getSubcommand();

      if (subcommand === 'set') {
        const role = interaction.options.getRole('role');
        const channel = interaction.options.getChannel('channel');

        if (!role) {
          return interaction.reply({
            content: 'Please provide a valid role.',
            flags: 64,
          });
        }

        const success = await setBotAlertsConfig(
          client,
          interaction.guild.id,
          role.id,
          channel?.id || null
        );

        if (success) {
          const embed = {
            color: 0x00FF00,
            title: 'Bot Alerts Configured',
            description: `Scam detection alerts are now enabled.`,
            fields: [
              {
                name: 'Alert Role',
                value: `${role} (${role.id})`,
              },
              {
                name: 'Alert Channel',
                value: channel ? `${channel} (${channel.id})` : 'Current channel (where scam was posted)',
              },
            ],
            timestamp: new Date().toISOString(),
          };

          await interaction.reply({ embeds: [embed] });
        } else {
          await interaction.reply({
            content: 'Failed to configure bot alerts. Please try again.',
            flags: 64,
          });
        }
      } else if (subcommand === 'disable') {
        const success = await disableBotAlerts(client, interaction.guild.id);

        if (success) {
          await interaction.reply({
            content: 'Bot alerts have been disabled.',
          });
        } else {
          await interaction.reply({
            content: 'Failed to disable bot alerts. Please try again.',
            flags: 64,
          });
        }
      } else if (subcommand === 'view') {
        const config = await getBotAlertsConfig(client, interaction.guild.id);

        const embed = {
          color: config.enabled ? 0x00FF00 : 0xFF0000,
          title: 'Bot Alert Configuration',
          fields: [
            {
              name: 'Status',
              value: config.enabled ? 'Enabled' : 'Disabled',
              inline: true,
            },
          ],
          timestamp: new Date().toISOString(),
        };

        if (config.enabled) {
          const role = interaction.guild.roles.cache.get(config.roleId);
          const channel = config.channelId
            ? interaction.guild.channels.cache.get(config.channelId)
            : null;

          embed.fields.push(
            {
              name: 'Alert Role',
              value: role ? `${role} (${role.id})` : 'Role not found',
              inline: true,
            },
            {
              name: 'Alert Channel',
              value: channel ? `${channel} (${channel.id})` : 'Same channel as detection',
              inline: true,
            }
          );
        }

        await interaction.reply({ embeds: [embed] });
      }
    } catch (error) {
      logger.error('Error in set-bot-alerts command:', error);
      await interaction.reply({
        content: 'An error occurred while configuring bot alerts.',
        flags: 64,
      });
    }
  },
};

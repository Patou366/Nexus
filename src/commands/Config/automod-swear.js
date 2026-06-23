import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { enableSwearAutomod, disableSwearAutomod, getSwearAutomodConfig } from '../../services/automodSwearService.js';

export default {
  data: new SlashCommandBuilder()
    .setName('automod-swear')
    .setDescription('Manage the swear word automod that fires a funny roast comeback')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub
        .setName('enable')
        .setDescription('Enable the swear word automod for this server')
    )
    .addSubcommand(sub =>
      sub
        .setName('disable')
        .setDescription('Disable the swear word automod for this server')
    )
    .addSubcommand(sub =>
      sub
        .setName('status')
        .setDescription('Check whether the swear word automod is currently enabled')
    ),

  async execute(interaction) {
    try {
      const sub = interaction.options.getSubcommand();
      const guildId = interaction.guild.id;

      if (sub === 'enable') {
        const success = await enableSwearAutomod(guildId);

        if (success) {
          return interaction.reply({
            embeds: [{
              color: 0x57F287,
              title: '✅ Swear Automod Enabled',
              description: 'The bot will now reply with a random roast comeback whenever someone swears in this server.',
              timestamp: new Date().toISOString()
            }]
          });
        }

        return interaction.reply({
          content: 'Failed to enable swear automod. Please try again.',
          ephemeral: true
        });
      }

      if (sub === 'disable') {
        const success = await disableSwearAutomod(guildId);

        if (success) {
          return interaction.reply({
            embeds: [{
              color: 0xED4245,
              title: '🔇 Swear Automod Disabled',
              description: 'The swear word automod has been turned off. No more comebacks.',
              timestamp: new Date().toISOString()
            }]
          });
        }

        return interaction.reply({
          content: 'Failed to disable swear automod. Please try again.',
          ephemeral: true
        });
      }

      if (sub === 'status') {
        const config = await getSwearAutomodConfig(guildId);

        return interaction.reply({
          embeds: [{
            color: config.enabled ? 0x57F287 : 0xED4245,
            title: 'Swear Automod Status',
            fields: [
              {
                name: 'Status',
                value: config.enabled ? '✅ Enabled' : '🔇 Disabled',
                inline: true
              }
            ],
            footer: {
              text: config.enabled
                ? 'The bot is actively watching for swear words.'
                : 'Use /automod-swear enable to turn it on.'
            },
            timestamp: new Date().toISOString()
          }],
          ephemeral: true
        });
      }
    } catch (error) {
      logger.error('Error in automod-swear command:', error);
      await interaction.reply({
        content: 'An error occurred while updating the swear automod setting.',
        ephemeral: true
      }).catch(() => null);
    }
  }
};

import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { enableAutoSlowmode, disableAutoSlowmode, getAutoSlowmodeConfig } from '../../services/autoSlowmodeService.js';

export default {
  data: new SlashCommandBuilder()
    .setName('slowmode-auto')
    .setDescription('Automatically set slowmode when message spikes are detected')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub.setName('enable').setDescription('Enable auto-slowmode for this server')
    )
    .addSubcommand(sub =>
      sub.setName('disable').setDescription('Disable auto-slowmode for this server')
    )
    .addSubcommand(sub =>
      sub.setName('status').setDescription('Check whether auto-slowmode is currently enabled')
    ),

  async execute(interaction) {
    try {
      const sub     = interaction.options.getSubcommand();
      const guildId = interaction.guild.id;

      if (sub === 'enable') {
        const success = await enableAutoSlowmode(guildId);
        if (success) {
          return interaction.reply({
            embeds: [{
              color: 0x57F287,
              title: '✅ Auto-Slowmode Enabled',
              description: 'The bot will now automatically apply slowmode when message spikes are detected.\n\n' +
                '**Tiers:**\n' +
                '• 5–9 messages / 5s → **1s** slowmode\n' +
                '• 10+ messages / 5s → **5s** slowmode\n\n' +
                'Slowmode is removed after **30 seconds** of calm activity.',
              timestamp: new Date().toISOString()
            }]
          });
        }
        return interaction.reply({ content: 'Failed to enable auto-slowmode. Please try again.', flags: 64 });
      }

      if (sub === 'disable') {
        const success = await disableAutoSlowmode(guildId);
        if (success) {
          return interaction.reply({
            embeds: [{
              color: 0xED4245,
              title: '🔇 Auto-Slowmode Disabled',
              description: 'The bot will no longer automatically apply slowmode.',
              timestamp: new Date().toISOString()
            }]
          });
        }
        return interaction.reply({ content: 'Failed to disable auto-slowmode. Please try again.', flags: 64 });
      }

      if (sub === 'status') {
        const config = await getAutoSlowmodeConfig(guildId);
        return interaction.reply({
          embeds: [{
            color: config.enabled ? 0x57F287 : 0xED4245,
            title: 'Auto-Slowmode Status',
            fields: [
              { name: 'Status', value: config.enabled ? '✅ Enabled' : '🔇 Disabled', inline: true }
            ],
            footer: {
              text: config.enabled
                ? 'Watching all channels for message spikes.'
                : 'Use /slowmode-auto enable to turn it on.'
            },
            timestamp: new Date().toISOString()
          }],
          flags: 64
        });
      }
    } catch (error) {
      logger.error('Error in slowmode-auto command:', error);
      await interaction.reply({
        content: 'An error occurred while updating the auto-slowmode setting.',
        flags: 64
      }).catch(() => null);
    }
  }
};

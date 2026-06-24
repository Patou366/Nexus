import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { setAfk } from '../../services/afkService.js';

export default {
  data: new SlashCommandBuilder()
    .setName('afk')
    .setDescription('Set your AFK status with a custom message')
    .addStringOption(option =>
      option
        .setName('message')
        .setDescription('The message shown when someone mentions you while AFK')
        .setMaxLength(200)
        .setRequired(false)
    ),

  async execute(interaction) {
    try {
      if (!interaction.guild) {
        await InteractionHelper.safeReply(interaction, {
          content: 'This command can only be used in a server.',
          flags: 64
        });
        return;
      }

      const message = interaction.options.getString('message') || 'AFK';

      const saved = await setAfk(interaction.guild.id, interaction.user.id, message);

      if (!saved) {
        await InteractionHelper.safeReply(interaction, {
          content: 'Could not set your AFK status right now. Please try again later.',
          flags: 64
        });
        return;
      }

      const embed = createEmbed({
        title: '💤 AFK Set',
        description: `You are now AFK, ${interaction.user}. I'll let people know when they mention you.`,
        color: 'info',
        fields: [
          { name: 'Your message', value: message.slice(0, 200) }
        ]
      });

      await InteractionHelper.safeReply(interaction, {
        embeds: [embed],
        allowedMentions: { parse: [] }
      });

      logger.info('AFK command executed', {
        userId: interaction.user.id,
        guildId: interaction.guild.id
      });
    } catch (error) {
      logger.error('AFK command execution failed', {
        error: error.message,
        stack: error.stack,
        userId: interaction.user.id,
        guildId: interaction.guildId,
        commandName: 'afk'
      });
      await handleInteractionError(interaction, error, {
        commandName: 'afk',
        source: 'afk_command'
      });
    }
  }
};

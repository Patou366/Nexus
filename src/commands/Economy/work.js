import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed } from '../../utils/embeds.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { claimWork, getEconomyConfig } from '../../services/economy.js';

export default {
  data: new SlashCommandBuilder()
    .setName('work')
    .setDescription('Work a random job to earn coins (4-hour cooldown)')
    .setDMPermission(false),

  async execute(interaction) {
    const deferSuccess = await InteractionHelper.safeDefer(interaction);
    if (!deferSuccess) return;

    try {
      const guildId = interaction.guildId;
      const userId = interaction.user.id;
      const config = await getEconomyConfig(guildId);
      const result = await claimWork(guildId, userId);

      if (!result.success) {
        const embed = errorEmbed(
          `⏳ Still on shift!\nYou can work again <t:${Math.floor(result.nextWork / 1000)}:R>.`
        );
        return InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
      }

      const embed = createEmbed({
        title: `${result.emoji} Work Complete!`,
        description:
          `You worked as a **${result.job}** and earned **${result.earned.toLocaleString()} ${config.currencyEmoji}**!\n\n` +
          `💰 New balance: **${result.newTotal.toLocaleString()} ${config.currencyName}**\n` +
          `⏰ Next shift: <t:${Math.floor((Date.now() + (config.workCooldown || 4 * 60 * 60 * 1000)) / 1000)}:R>`,
        color: 'success',
        footer: { text: '🧪 In beta (Testing)' },
      });

      await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    } catch (error) {
      await handleInteractionError(interaction, error, { type: 'command', commandName: 'work' });
    }
  },
};

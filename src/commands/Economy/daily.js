import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { claimDaily, getEconomyConfig } from '../../services/economy.js';

export default {
  data: new SlashCommandBuilder()
    .setName('daily')
    .setDescription('Claim your daily coin reward (resets every 24 hours)')
    .setDMPermission(false),

  async execute(interaction) {
    const deferSuccess = await InteractionHelper.safeDefer(interaction);
    if (!deferSuccess) return;

    try {
      const guildId = interaction.guildId;
      const userId = interaction.user.id;
      const config = await getEconomyConfig(guildId);
      const result = await claimDaily(guildId, userId);

      if (!result.success) {
        const embed = errorEmbed(
          '⏳ Already Claimed',
          `You already claimed your daily reward!\n\nNext claim: <t:${Math.floor(result.nextDaily / 1000)}:R>`
        );
        return InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
      }

      const streakText = result.streak > 1
        ? `\n🔥 **${result.streak}-day streak!** (+${result.streakBonus} bonus ${config.currencyName})`
        : '';

      const embed = successEmbed(
        `${config.currencyEmoji} Daily Reward Claimed!`,
        `You received **${result.earned.toLocaleString()} ${config.currencyName}**!${streakText}\n\n` +
        `💰 New balance: **${result.newTotal.toLocaleString()} ${config.currencyName}**\n` +
        `⏰ Next claim: <t:${Math.floor((Date.now() + 86400000) / 1000)}:R>`
      );

      await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    } catch (error) {
      await handleInteractionError(interaction, error, { type: 'command', commandName: 'daily' });
    }
  },
};

import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getUserBalance, getUserInventory, getEconomyConfig } from '../../services/economy.js';

export default {
  data: new SlashCommandBuilder()
    .setName('coins')
    .setDescription('Check your coin balance or another member\'s balance')
    .setDMPermission(false)
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('The member to check (leave empty to check yourself)')
        .setRequired(false)
    ),

  async execute(interaction) {
    const deferSuccess = await InteractionHelper.safeDefer(interaction);
    if (!deferSuccess) return;

    try {
      const target = interaction.options.getUser('user') || interaction.user;
      const guildId = interaction.guildId;
      const config = await getEconomyConfig(guildId);
      const balance = await getUserBalance(guildId, target.id);
      const inv = await getUserInventory(guildId, target.id);

      const isSelf = target.id === interaction.user.id;
      const packCount = (inv.packs || []).length;

      const embed = createEmbed({
        title: `${config.currencyEmoji} ${isSelf ? 'Your Wallet' : `${target.displayName}'s Wallet`}`,
        description: `**${balance.coins.toLocaleString()} ${config.currencyName}**`,
        color: 'primary',
        fields: [
          {
            name: '📦 Packs',
            value: `${packCount} pack${packCount !== 1 ? 's' : ''} in inventory`,
            inline: true,
          },
          {
            name: '🔥 Daily Streak',
            value: `${balance.dailyStreak || 0} day${(balance.dailyStreak || 0) !== 1 ? 's' : ''}`,
            inline: true,
          },
          {
            name: '⏰ Next Daily',
            value: balance.lastDaily
              ? `<t:${Math.floor((balance.lastDaily + 86400000) / 1000)}:R>`
              : 'Available now!',
            inline: true,
          },
        ],
        thumbnail: target.displayAvatarURL({ size: 64 }),
      });

      await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    } catch (error) {
      await handleInteractionError(interaction, error, { type: 'command', commandName: 'coins' });
    }
  },
};

import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { createEmbed, errorEmbed } from '../../utils/embeds.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getEconomyConfig, getUserBalance } from '../../services/economy.js';

export default {
  data: new SlashCommandBuilder()
    .setName('pack-shop')
    .setDescription('Browse the pack shop and see what\'s available to buy')
    .setDMPermission(false),

  async execute(interaction) {
    const deferSuccess = await InteractionHelper.safeDefer(interaction);
    if (!deferSuccess) return;

    try {
      const guildId = interaction.guildId;
      const config = await getEconomyConfig(guildId);
      const balance = await getUserBalance(guildId, interaction.user.id);

      if (!config.packs || config.packs.length === 0) {
        return InteractionHelper.safeEditReply(interaction, {
          embeds: [errorEmbed('🏪 Shop Empty', 'No packs are available in the shop right now. Check back later!')],
        });
      }

      const fields = config.packs.map(pack => {
        const rewardLines = pack.rewards
          .map(r => `• ${r.label} — **${r.chance}%** chance`)
          .join('\n');
        const canAfford = balance.coins >= pack.price ? '✅' : '❌';
        return {
          name: `${pack.emoji} ${pack.name} — ${pack.price.toLocaleString()} ${config.currencyEmoji} ${canAfford}`,
          value: `*${pack.description}*\n**Possible Rewards:**\n${rewardLines}`,
          inline: false,
        };
      });

      const embed = createEmbed({
        title: `🏪 Pack Shop`,
        description: `Your balance: **${balance.coins.toLocaleString()} ${config.currencyEmoji}**\n\nUse \`/buy-pack\` to purchase a pack!`,
        color: 'primary',
        fields,
        footer: { text: '🧪 In beta (Testing)' },
      });

      await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    } catch (error) {
      await handleInteractionError(interaction, error, { type: 'command', commandName: 'pack-shop' });
    }
  },
};

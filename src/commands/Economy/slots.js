import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed } from '../../utils/embeds.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { playSlots, getEconomyConfig } from '../../services/economy.js';

export default {
  data: new SlashCommandBuilder()
    .setName('slots')
    .setDescription('Spin the slot machine and test your luck!')
    .setDMPermission(false)
    .addIntegerOption(opt =>
      opt.setName('bet').setDescription('Amount to bet').setRequired(true).setMinValue(10)
    ),

  async execute(interaction) {
    const deferSuccess = await InteractionHelper.safeDefer(interaction);
    if (!deferSuccess) return;

    try {
      const guildId = interaction.guildId;
      const userId = interaction.user.id;
      const bet = interaction.options.getInteger('bet');
      const config = await getEconomyConfig(guildId);

      const result = await playSlots(guildId, userId, bet);

      if (!result.success) {
        return InteractionHelper.safeEditReply(interaction, {
          embeds: [errorEmbed(`❌ You don't have enough ${config.currencyName} to bet **${bet.toLocaleString()}**.`)],
        });
      }

      const reelDisplay = `╔══════════════╗\n║  ${result.reels.join('  ')}  ║\n╚══════════════╝`;

      let outcomeText = '';
      let color = 'error';

      if (result.outcome === 'jackpot') {
        outcomeText = `🎰 **JACKPOT! 7️⃣7️⃣7️⃣** — ${result.multiplier}x payout!\n✨ You won **+${Math.abs(result.netChange).toLocaleString()} ${config.currencyEmoji}**!`;
        color = 'success';
      } else if (result.outcome === 'three_match') {
        outcomeText = `🎉 **Three of a kind!** — ${result.multiplier}x payout!\n✨ You won **+${Math.abs(result.netChange).toLocaleString()} ${config.currencyEmoji}**!`;
        color = 'success';
      } else if (result.outcome === 'two_match') {
        outcomeText = `😅 **Two matching** — 0.5x consolation prize.\n✨ You won back **+${Math.abs(result.netChange).toLocaleString()} ${config.currencyEmoji}**.`;
        color = 'warning';
      } else {
        outcomeText = `😔 **No match** — better luck next time.\n💸 You lost **-${bet.toLocaleString()} ${config.currencyEmoji}**.`;
        color = 'error';
      }

      const embed = createEmbed({
        title: '🎰 Slot Machine',
        description:
          `\`\`\`\n${reelDisplay}\n\`\`\`\n` +
          outcomeText +
          `\n\n💰 Balance: **${result.newTotal.toLocaleString()} ${config.currencyName}**`,
        color,
        footer: { text: '🍒×2 | 🍋×2.5 | 🍇×3 | ⭐×5 | 💎×8 | 7️⃣×15' },
      });

      await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    } catch (error) {
      await handleInteractionError(interaction, error, { type: 'command', commandName: 'slots' });
    }
  },
};

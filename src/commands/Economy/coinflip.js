import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed } from '../../utils/embeds.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { playCoinflip, getEconomyConfig } from '../../services/economy.js';

export default {
  data: new SlashCommandBuilder()
    .setName('coinflip')
    .setDescription('Bet coins on a coin flip — double or nothing!')
    .setDMPermission(false)
    .addIntegerOption(opt =>
      opt.setName('amount').setDescription('Amount to bet').setRequired(true).setMinValue(10)
    )
    .addStringOption(opt =>
      opt.setName('choice')
        .setDescription('Heads or tails?')
        .setRequired(true)
        .addChoices(
          { name: '🪙 Heads', value: 'heads' },
          { name: '🔵 Tails', value: 'tails' }
        )
    ),

  async execute(interaction) {
    const deferSuccess = await InteractionHelper.safeDefer(interaction);
    if (!deferSuccess) return;

    try {
      const guildId = interaction.guildId;
      const userId = interaction.user.id;
      const amount = interaction.options.getInteger('amount');
      const choice = interaction.options.getString('choice');
      const config = await getEconomyConfig(guildId);

      const result = await playCoinflip(guildId, userId, amount, choice);

      if (!result.success) {
        return InteractionHelper.safeEditReply(interaction, {
          embeds: [errorEmbed(`❌ You don't have enough ${config.currencyName} to bet **${amount.toLocaleString()}**.`)],
        });
      }

      const resultEmoji = result.result === 'heads' ? '🪙' : '🔵';
      const choiceLabel = choice === 'heads' ? '🪙 Heads' : '🔵 Tails';
      const resultLabel = result.result === 'heads' ? '🪙 Heads' : '🔵 Tails';

      const embed = createEmbed({
        title: result.won ? '🎉 You Won!' : '💸 You Lost!',
        description:
          `You picked **${choiceLabel}** — the coin landed on **${resultLabel}** ${resultEmoji}\n\n` +
          (result.won
            ? `✨ You won **+${amount.toLocaleString()} ${config.currencyEmoji}**!`
            : `😬 You lost **-${amount.toLocaleString()} ${config.currencyEmoji}**.`) +
          `\n\n💰 Balance: **${result.newTotal.toLocaleString()} ${config.currencyName}**`,
        color: result.won ? 'success' : 'error',
        footer: { text: '🧪 In beta (Testing)' },
      });

      await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    } catch (error) {
      await handleInteractionError(interaction, error, { type: 'command', commandName: 'coinflip' });
    }
  },
};

import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed } from '../../utils/embeds.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { transferCoins, getEconomyConfig } from '../../services/economy.js';

export default {
  data: new SlashCommandBuilder()
    .setName('pay')
    .setDescription('Send coins to another member')
    .setDMPermission(false)
    .addUserOption(opt =>
      opt.setName('user').setDescription('Who to pay').setRequired(true)
    )
    .addIntegerOption(opt =>
      opt.setName('amount').setDescription('Amount to send (minimum 1)').setRequired(true).setMinValue(1)
    ),

  async execute(interaction) {
    const deferSuccess = await InteractionHelper.safeDefer(interaction);
    if (!deferSuccess) return;

    try {
      const guildId = interaction.guildId;
      const fromId = interaction.user.id;
      const target = interaction.options.getUser('user');
      const amount = interaction.options.getInteger('amount');
      const config = await getEconomyConfig(guildId);

      if (target.bot) {
        return InteractionHelper.safeEditReply(interaction, {
          embeds: [errorEmbed("❌ You can't pay a bot.")],
        });
      }

      const result = await transferCoins(guildId, fromId, target.id, amount);

      if (!result.success) {
        if (result.reason === 'self') {
          return InteractionHelper.safeEditReply(interaction, {
            embeds: [errorEmbed("❌ You can't pay yourself.")],
          });
        }
        if (result.reason === 'funds') {
          return InteractionHelper.safeEditReply(interaction, {
            embeds: [errorEmbed(`❌ Insufficient funds. You only have **${(result.have || 0).toLocaleString()} ${config.currencyEmoji}**.`)],
          });
        }
        return InteractionHelper.safeEditReply(interaction, {
          embeds: [errorEmbed('❌ Transfer failed.')],
        });
      }

      const embed = createEmbed({
        title: `${config.currencyEmoji} Payment Sent!`,
        description:
          `You sent **${amount.toLocaleString()} ${config.currencyName}** to ${target}!\n\n` +
          `💰 Your new balance: **${result.fromTotal.toLocaleString()} ${config.currencyName}**`,
        color: 'success',
        thumbnail: target.displayAvatarURL({ size: 64 }),
        footer: { text: '🧪 In beta (Testing)' },
      });

      await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    } catch (error) {
      await handleInteractionError(interaction, error, { type: 'command', commandName: 'pay' });
    }
  },
};

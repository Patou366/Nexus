import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../../utils/embeds.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getEconomyConfig, getUserBalance, buyPack, openPack } from '../../services/economy.js';

export default {
  data: new SlashCommandBuilder()
    .setName('buy-pack')
    .setDescription('Buy a pack from the shop')
    .setDMPermission(false)
    .addStringOption(option =>
      option
        .setName('pack')
        .setDescription('The pack to buy')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addBooleanOption(option =>
      option
        .setName('open')
        .setDescription('Open the pack immediately after buying? (default: yes)')
        .setRequired(false)
    ),

  async autocomplete(interaction) {
    try {
      const config = await getEconomyConfig(interaction.guildId);
      const focused = interaction.options.getFocused().toLowerCase();
      const choices = (config.packs || [])
        .filter(p => p.name.toLowerCase().includes(focused) || p.id.includes(focused))
        .slice(0, 25)
        .map(p => ({ name: `${p.emoji} ${p.name} — ${p.price} coins`, value: p.id }));
      await interaction.respond(choices);
    } catch {
      await interaction.respond([]);
    }
  },

  async execute(interaction) {
    const deferSuccess = await InteractionHelper.safeDefer(interaction);
    if (!deferSuccess) return;

    try {
      const guildId = interaction.guildId;
      const userId = interaction.user.id;
      const packId = interaction.options.getString('pack');
      const openNow = interaction.options.getBoolean('open') ?? true;
      const config = await getEconomyConfig(guildId);

      // Atomic purchase: deducts coins + adds to inventory in one lock
      const purchase = await buyPack(guildId, userId, packId);

      if (!purchase.success) {
        if (purchase.reason === 'not_found') {
          return InteractionHelper.safeEditReply(interaction, {
            embeds: [errorEmbed('❌ Unknown Pack', 'That pack does not exist. Use `/pack-shop` to see available packs.')],
          });
        }
        if (purchase.reason === 'funds') {
          return InteractionHelper.safeEditReply(interaction, {
            embeds: [errorEmbed(
              '💸 Insufficient Funds',
              `You need **${purchase.need.toLocaleString()} ${config.currencyEmoji}** but only have **${purchase.have.toLocaleString()}**.\n\nUse \`/daily\` or \`/work\` to earn more!`
            )],
          });
        }
        return InteractionHelper.safeEditReply(interaction, {
          embeds: [errorEmbed('❌ Purchase Failed', 'Could not complete the purchase.')],
        });
      }

      const { pack } = purchase;

      if (openNow) {
        // Pack is already in inventory — open it immediately
        const reward = await openPack(guildId, userId, packId);

        if (!reward) {
          // Rare edge case: pack was consumed by a concurrent open before this call resolved
          const newBalance = await getUserBalance(guildId, userId);
          const embed = successEmbed(
            `${pack.emoji} Pack Purchased!`,
            `You bought a **${pack.name}** for **${pack.price.toLocaleString()} ${config.currencyEmoji}**!\n\n` +
            `📦 Your pack is in inventory — use \`/open-pack\` to open it.\n` +
            `👝 Wallet: **${newBalance.coins.toLocaleString()} ${config.currencyEmoji}**`
          );
          return InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        }

        const newBalance = await getUserBalance(guildId, userId);
        const embed = successEmbed(
          `${pack.emoji} Pack Opened!`,
          `You bought and opened a **${pack.name}** for **${pack.price.toLocaleString()} ${config.currencyEmoji}**!\n\n` +
          `✨ **You got:** ${reward.label}\n\n` +
          `👝 Wallet: **${newBalance.coins.toLocaleString()} ${config.currencyEmoji}**`
        );

        return InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
      } else {
        const embed = successEmbed(
          `${pack.emoji} Pack Purchased!`,
          `You bought a **${pack.name}** for **${pack.price.toLocaleString()} ${config.currencyEmoji}**!\n\n` +
          `📦 The pack has been added to your inventory. Use \`/open-pack\` when ready!\n` +
          `👝 Wallet: **${purchase.remaining.toLocaleString()} ${config.currencyEmoji}**`
        );

        return InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
      }
    } catch (error) {
      await handleInteractionError(interaction, error, { type: 'command', commandName: 'buy-pack' });
    }
  },
};

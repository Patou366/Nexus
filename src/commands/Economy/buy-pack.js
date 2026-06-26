import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../../utils/embeds.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getEconomyConfig, getUserBalance, removeCoins, addPackToInventory, openPack } from '../../services/economy.js';

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

      const pack = (config.packs || []).find(p => p.id === packId);
      if (!pack) {
        return InteractionHelper.safeEditReply(interaction, {
          embeds: [errorEmbed('❌ Unknown Pack', 'That pack does not exist. Use `/pack-shop` to see available packs.')],
        });
      }

      const balance = await getUserBalance(guildId, userId);
      if (balance.coins < pack.price) {
        return InteractionHelper.safeEditReply(interaction, {
          embeds: [errorEmbed(
            '💸 Insufficient Funds',
            `You need **${pack.price.toLocaleString()} ${config.currencyEmoji}** but only have **${balance.coins.toLocaleString()}**.\n\nUse \`/daily\` to earn more!`
          )],
        });
      }

      await removeCoins(guildId, userId, pack.price);

      if (openNow) {
        await addPackToInventory(guildId, userId, packId);
        const reward = await openPack(guildId, userId, packId);
        const newBalance = await (await import('../../services/economy.js')).getUserBalance(guildId, userId);

        const embed = successEmbed(
          `${pack.emoji} Pack Opened!`,
          `You bought and opened a **${pack.name}** for **${pack.price.toLocaleString()} ${config.currencyEmoji}**!\n\n` +
          `✨ **You got:** ${reward.label}\n\n` +
          `💰 New balance: **${newBalance.coins.toLocaleString()} ${config.currencyEmoji}**`
        );

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
      } else {
        await addPackToInventory(guildId, userId, packId);
        const newBalance = await (await import('../../services/economy.js')).getUserBalance(guildId, userId);

        const embed = successEmbed(
          `${pack.emoji} Pack Purchased!`,
          `You bought a **${pack.name}** for **${pack.price.toLocaleString()} ${config.currencyEmoji}**!\n\n` +
          `📦 The pack has been added to your inventory.\n` +
          `💰 New balance: **${newBalance.coins.toLocaleString()} ${config.currencyEmoji}**`
        );

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
      }
    } catch (error) {
      await handleInteractionError(interaction, error, { type: 'command', commandName: 'buy-pack' });
    }
  },
};

import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from 'discord.js';
import { getEconomyConfig, getUserBalance } from '../../services/economy.js';
import { errorEmbed } from '../../utils/embeds.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
  data: new SlashCommandBuilder()
    .setName('shop')
    .setDescription('Browse and buy items from the server shop')
    .setDMPermission(false),

  async execute(interaction) {
    const deferSuccess = await InteractionHelper.safeDefer(interaction, { ephemeral: false });
    if (!deferSuccess) return;

    try {
      const guildId = interaction.guildId;
      const config = await getEconomyConfig(guildId);

      if (!config.enabled) {
        return InteractionHelper.safeEditReply(interaction, {
          embeds: [errorEmbed('Economy Disabled', 'The economy system is not enabled on this server.')],
        });
      }

      const items = config.shopItems || [];
      const balance = await getUserBalance(guildId, interaction.user.id);
      const userCoins = balance.coins || 0;

      // Build shop embed with server's custom title / color / footer
      const embed = new EmbedBuilder()
        .setTitle(config.shopTitle || 'Server Shop')
        .setTimestamp();

      // Parse and apply the admin-configured color — fall back to Discord blurple
      const rawColor = (config.shopColor || '#5865F2').trim();
      try {
        embed.setColor(rawColor);
      } catch {
        embed.setColor('#5865F2');
      }

      if (config.shopFooter) {
        embed.setFooter({ text: config.shopFooter });
      } else {
        embed.setFooter({ text: `Your balance: ${userCoins.toLocaleString()} ${config.currencyEmoji}` });
      }

      if (items.length === 0) {
        embed.setDescription(
          '*No items are available in the shop yet.*\n' +
          'Admins can add items via `/economy-dashboard`.'
        );
        return InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
      }

      // Build item list in embed description
      const lines = items.slice(0, 25).map((item, i) => {
        const typeTag = item.type === 'role' ? '🏷️ Role' : '✨ Custom';
        const canAfford = userCoins >= item.price ? '✅' : '❌';
        return (
          `**${i + 1}. ${item.emoji} ${item.name}** — ${item.price.toLocaleString()} ${config.currencyEmoji} ${canAfford}\n` +
          `  ${typeTag} • *${item.description || 'No description'}*`
        );
      });

      embed.setDescription(
        `**Your balance:** ${userCoins.toLocaleString()} ${config.currencyEmoji}\n\u200b\n` +
        lines.join('\n\n').substring(0, 3800)
      );

      if (items.length > 25) {
        embed.addFields({ name: '\u200b', value: `*…and ${items.length - 25} more items (showing first 25)*`, inline: false });
      }

      // Build buy select menu (max 25 options, Discord limit)
      const selectOptions = items.slice(0, 25).map(item =>
        new StringSelectMenuOptionBuilder()
          .setValue(item.id)
          .setLabel(`${item.name} — ${item.price.toLocaleString()} ${config.currencyEmoji}`.substring(0, 100))
          .setDescription((item.description || 'No description').substring(0, 100))
          .setEmoji(item.emoji)
      );

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`shop_buy:${guildId}`)
        .setPlaceholder('Select an item to purchase…')
        .addOptions(selectOptions);

      const row = new ActionRowBuilder().addComponents(selectMenu);

      await InteractionHelper.safeEditReply(interaction, { embeds: [embed], components: [row] });
    } catch (error) {
      await handleInteractionError(interaction, error, { type: 'command', commandName: 'shop' });
    }
  },
};

import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { getEconomyConfig, saveEconomyConfig, addPackToInventory, getUserBalance } from '../../services/economy.js';

function buildDashboardEmbed(config) {
  const packList = (config.packs || [])
    .map((p, i) =>
      `**${i + 1}. ${p.emoji} ${p.name}** — ${p.price.toLocaleString()} ${config.currencyEmoji}\n` +
      `  *${p.description}*\n` +
      p.rewards.map(r => `  • ${r.label} (${r.chance}% chance)`).join('\n')
    )
    .join('\n\n') || '*No packs configured.*';

  return createEmbed({
    title: '⚙️ Economy Dashboard',
    description: `Configure the economy system for this server.\n\u200b`,
    color: 'primary',
    fields: [
      {
        name: '💰 Currency Settings',
        value:
          `**Name:** ${config.currencyName}\n` +
          `**Emoji:** ${config.currencyEmoji}\n` +
          `**System:** ${config.enabled ? '✅ Enabled' : '❌ Disabled'}`,
        inline: true,
      },
      {
        name: '📅 Daily Reward',
        value:
          `**Base:** ${config.dailyAmount} ${config.currencyEmoji}\n` +
          `**Streak Bonus:** +${config.dailyStreakBonus}/day`,
        inline: true,
      },
      { name: '\u200b', value: '\u200b', inline: false },
      {
        name: `📦 Packs (${(config.packs || []).length})`,
        value: packList.substring(0, 1000),
        inline: false,
      },
    ],
    footer: { text: 'Changes save immediately' },
  });
}

function buildDashboardRows(config) {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`econ_dashboard:toggle:${config._guildId || 'guild'}`)
      .setLabel(config.enabled ? 'Disable Economy' : 'Enable Economy')
      .setStyle(config.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`econ_dashboard:edit_currency:${config._guildId || 'guild'}`)
      .setLabel('Edit Currency')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`econ_dashboard:edit_daily:${config._guildId || 'guild'}`)
      .setLabel('Edit Daily Reward')
      .setStyle(ButtonStyle.Primary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`econ_dashboard:add_pack:${config._guildId || 'guild'}`)
      .setLabel('Add Pack')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`econ_dashboard:remove_pack:${config._guildId || 'guild'}`)
      .setLabel('Remove Pack')
      .setStyle(ButtonStyle.Danger)
      .setDisabled((config.packs || []).length === 0),
    new ButtonBuilder()
      .setCustomId(`econ_dashboard:refresh:${config._guildId || 'guild'}`)
      .setLabel('🔄 Refresh')
      .setStyle(ButtonStyle.Secondary)
  );

  return [row1, row2];
}

async function handlePackSpawnClaim(interaction, packId, spawnInteractionId) {
  try {
    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    const config = await getEconomyConfig(guildId);
    const pack = (config.packs || []).find(p => p.id === packId);

    if (!pack) {
      return interaction.reply({ embeds: [errorEmbed('❌ Error', 'This pack no longer exists.')], ephemeral: true });
    }

    const msg = interaction.message;
    const currentButton = msg.components[0]?.components[0];
    if (!currentButton || currentButton.disabled) {
      return interaction.reply({ embeds: [errorEmbed('❌ Too Late', 'All packs have been claimed!')], ephemeral: true });
    }

    const labelMatch = currentButton.label?.match(/\((\d+) left\)/);
    let remaining = labelMatch ? parseInt(labelMatch[1]) : 1;

    if (remaining <= 0) {
      return interaction.reply({ embeds: [errorEmbed('❌ Too Late', 'All packs have been claimed!')], ephemeral: true });
    }

    remaining -= 1;
    await addPackToInventory(guildId, userId, packId);

    const newRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(interaction.customId)
        .setLabel(remaining > 0 ? `Claim Pack (${remaining} left)` : 'All Claimed!')
        .setEmoji(pack.emoji)
        .setStyle(remaining > 0 ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setDisabled(remaining === 0)
    );

    await interaction.update({ components: [newRow] });
    await interaction.followUp({
      embeds: [successEmbed(`${pack.emoji} Pack Claimed!`, `You got a **${pack.name}**! Check your inventory and use \`/buy-pack\` to open it!`)],
      ephemeral: true,
    });
  } catch (err) {
    logger.error('[Economy] Pack spawn claim error:', err);
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ embeds: [errorEmbed('❌ Error', 'Failed to claim the pack.')], ephemeral: true });
      }
    } catch {}
  }
}

async function handleDashboard(interaction, action, guildId) {
  try {
    const config = await getEconomyConfig(guildId);
    config._guildId = guildId;

    if (action === 'toggle') {
      const updated = await saveEconomyConfig(guildId, { enabled: !config.enabled });
      updated._guildId = guildId;
      await interaction.update({
        embeds: [buildDashboardEmbed(updated)],
        components: buildDashboardRows(updated),
      });
      return;
    }

    if (action === 'refresh') {
      await interaction.update({
        embeds: [buildDashboardEmbed(config)],
        components: buildDashboardRows(config),
      });
      return;
    }

    if (action === 'edit_currency') {
      const modal = new ModalBuilder()
        .setCustomId(`econ_modal:currency:${guildId}`)
        .setTitle('Edit Currency Settings')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('currencyName')
              .setLabel('Currency Name')
              .setStyle(TextInputStyle.Short)
              .setValue(config.currencyName)
              .setMaxLength(20)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('currencyEmoji')
              .setLabel('Currency Emoji')
              .setStyle(TextInputStyle.Short)
              .setValue(config.currencyEmoji)
              .setMaxLength(8)
              .setRequired(true)
          )
        );
      return interaction.showModal(modal);
    }

    if (action === 'edit_daily') {
      const modal = new ModalBuilder()
        .setCustomId(`econ_modal:daily:${guildId}`)
        .setTitle('Edit Daily Reward')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('dailyAmount')
              .setLabel('Daily Coins Amount')
              .setStyle(TextInputStyle.Short)
              .setValue(String(config.dailyAmount))
              .setMaxLength(7)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('dailyStreakBonus')
              .setLabel('Streak Bonus Per Day')
              .setStyle(TextInputStyle.Short)
              .setValue(String(config.dailyStreakBonus))
              .setMaxLength(5)
              .setRequired(true)
          )
        );
      return interaction.showModal(modal);
    }

    if (action === 'add_pack') {
      const modal = new ModalBuilder()
        .setCustomId(`econ_modal:add_pack:${guildId}`)
        .setTitle('Add New Pack')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('packName')
              .setLabel('Pack Name')
              .setStyle(TextInputStyle.Short)
              .setMaxLength(32)
              .setPlaceholder('e.g. Legendary Pack')
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('packEmoji')
              .setLabel('Pack Emoji')
              .setStyle(TextInputStyle.Short)
              .setMaxLength(8)
              .setPlaceholder('e.g. 🌟')
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('packPrice')
              .setLabel('Price (in coins)')
              .setStyle(TextInputStyle.Short)
              .setMaxLength(7)
              .setPlaceholder('e.g. 1000')
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('packDescription')
              .setLabel('Description')
              .setStyle(TextInputStyle.Short)
              .setMaxLength(100)
              .setPlaceholder('A short description of the pack')
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('packRewards')
              .setLabel('Rewards (one per line: amount,chance)')
              .setStyle(TextInputStyle.Paragraph)
              .setPlaceholder('100,50\n300,35\n1000,15\n(amount in coins, chance in % — must total 100)')
              .setRequired(true)
          )
        );
      return interaction.showModal(modal);
    }

    if (action === 'remove_pack') {
      const modal = new ModalBuilder()
        .setCustomId(`econ_modal:remove_pack:${guildId}`)
        .setTitle('Remove a Pack')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('packId')
              .setLabel('Pack ID or Name to Remove')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('Enter the pack ID or name')
              .setRequired(true)
          )
        );
      return interaction.showModal(modal);
    }

    await interaction.reply({ embeds: [errorEmbed('❌ Unknown Action', 'Unknown dashboard action.')], ephemeral: true });
  } catch (err) {
    logger.error('[Economy] Dashboard button error:', err);
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ embeds: [errorEmbed('❌ Error', 'An error occurred.')], ephemeral: true });
      }
    } catch {}
  }
}

export default [
  {
    name: 'econ_dashboard',
    async execute(interaction, _client, args) {
      const action = args[0];
      const guildId = args[1] || interaction.guildId;
      await handleDashboard(interaction, action, guildId);
    },
  },
  {
    name: 'pack_spawn',
    async execute(interaction, _client, args) {
      const packId = args[0];
      const spawnId = args[1];
      await handlePackSpawnClaim(interaction, packId, spawnId);
    },
  },
];

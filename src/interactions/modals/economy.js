import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { getEconomyConfig, saveEconomyConfig } from '../../services/economy.js';

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

function buildDashboardRows(config, guildId) {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`econ_dashboard:toggle:${guildId}`)
      .setLabel(config.enabled ? 'Disable Economy' : 'Enable Economy')
      .setStyle(config.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`econ_dashboard:edit_currency:${guildId}`)
      .setLabel('Edit Currency')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`econ_dashboard:edit_daily:${guildId}`)
      .setLabel('Edit Daily Reward')
      .setStyle(ButtonStyle.Primary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`econ_dashboard:add_pack:${guildId}`)
      .setLabel('Add Pack')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`econ_dashboard:remove_pack:${guildId}`)
      .setLabel('Remove Pack')
      .setStyle(ButtonStyle.Danger)
      .setDisabled((config.packs || []).length === 0),
    new ButtonBuilder()
      .setCustomId(`econ_dashboard:refresh:${guildId}`)
      .setLabel('🔄 Refresh')
      .setStyle(ButtonStyle.Secondary)
  );

  return [row1, row2];
}

async function handleCurrencyModal(interaction, guildId) {
  const currencyName = interaction.fields.getTextInputValue('currencyName').trim();
  const currencyEmoji = interaction.fields.getTextInputValue('currencyEmoji').trim();

  if (!currencyName || !currencyEmoji) {
    return interaction.reply({ embeds: [errorEmbed('❌ Invalid Input', 'Currency name and emoji are required.')], ephemeral: true });
  }

  const updated = await saveEconomyConfig(guildId, { currencyName, currencyEmoji });
  await interaction.update({
    embeds: [buildDashboardEmbed(updated)],
    components: buildDashboardRows(updated, guildId),
  });
}

async function handleDailyModal(interaction, guildId) {
  const dailyAmount = parseInt(interaction.fields.getTextInputValue('dailyAmount'));
  const dailyStreakBonus = parseInt(interaction.fields.getTextInputValue('dailyStreakBonus'));

  if (isNaN(dailyAmount) || dailyAmount < 1 || dailyAmount > 1000000) {
    return interaction.reply({ embeds: [errorEmbed('❌ Invalid Amount', 'Daily amount must be between 1 and 1,000,000.')], ephemeral: true });
  }
  if (isNaN(dailyStreakBonus) || dailyStreakBonus < 0 || dailyStreakBonus > 10000) {
    return interaction.reply({ embeds: [errorEmbed('❌ Invalid Bonus', 'Streak bonus must be between 0 and 10,000.')], ephemeral: true });
  }

  const updated = await saveEconomyConfig(guildId, { dailyAmount, dailyStreakBonus });
  await interaction.update({
    embeds: [buildDashboardEmbed(updated)],
    components: buildDashboardRows(updated, guildId),
  });
}

async function handleAddPackModal(interaction, guildId) {
  const packName = interaction.fields.getTextInputValue('packName').trim();
  const packEmoji = interaction.fields.getTextInputValue('packEmoji').trim();
  const packPrice = parseInt(interaction.fields.getTextInputValue('packPrice'));
  const packDescription = interaction.fields.getTextInputValue('packDescription').trim();
  const packRewardsRaw = interaction.fields.getTextInputValue('packRewards').trim();

  if (isNaN(packPrice) || packPrice < 1) {
    return interaction.reply({ embeds: [errorEmbed('❌ Invalid Price', 'Price must be a positive number.')], ephemeral: true });
  }

  const rewardLines = packRewardsRaw.split('\n').map(l => l.trim()).filter(Boolean);
  const rewards = [];

  for (const line of rewardLines) {
    const parts = line.split(',');
    if (parts.length < 2) {
      return interaction.reply({ embeds: [errorEmbed('❌ Invalid Rewards', `Invalid line: \`${line}\`. Format: \`amount,chance\``)], ephemeral: true });
    }
    const amount = parseInt(parts[0].trim());
    const chance = parseFloat(parts[1].trim());
    if (isNaN(amount) || isNaN(chance)) {
      return interaction.reply({ embeds: [errorEmbed('❌ Invalid Rewards', `Could not parse: \`${line}\``)], ephemeral: true });
    }
    rewards.push({ type: 'coins', amount, chance, label: `${amount.toLocaleString()} coins` });
  }

  const totalChance = rewards.reduce((s, r) => s + r.chance, 0);
  if (Math.abs(totalChance - 100) > 1) {
    return interaction.reply({ embeds: [errorEmbed('❌ Chance Error', `Chances must total 100%. Got ${totalChance.toFixed(1)}%.`)], ephemeral: true });
  }

  const config = await getEconomyConfig(guildId);
  const packId = packName.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 20);
  const newPack = { id: packId, name: packName, emoji: packEmoji, description: packDescription, price: packPrice, rewards };
  const packs = [...(config.packs || []).filter(p => p.id !== packId), newPack];

  const updated = await saveEconomyConfig(guildId, { packs });
  await interaction.update({
    embeds: [buildDashboardEmbed(updated)],
    components: buildDashboardRows(updated, guildId),
  });
}

async function handleRemovePackModal(interaction, guildId) {
  const packInput = interaction.fields.getTextInputValue('packId').trim().toLowerCase();
  const config = await getEconomyConfig(guildId);
  const pack = (config.packs || []).find(p => p.id === packInput || p.name.toLowerCase() === packInput);

  if (!pack) {
    return interaction.reply({ embeds: [errorEmbed('❌ Not Found', `No pack found matching \`${packInput}\`.`)], ephemeral: true });
  }

  const packs = (config.packs || []).filter(p => p.id !== pack.id);
  const updated = await saveEconomyConfig(guildId, { packs });
  await interaction.update({
    embeds: [buildDashboardEmbed(updated)],
    components: buildDashboardRows(updated, guildId),
  });
}

export default [
  {
    name: 'econ_modal',
    async execute(interaction, _client, args) {
      const action = args[0];
      const guildId = args[1] || interaction.guildId;

      try {
        if (action === 'currency') return handleCurrencyModal(interaction, guildId);
        if (action === 'daily') return handleDailyModal(interaction, guildId);
        if (action === 'add_pack') return handleAddPackModal(interaction, guildId);
        if (action === 'remove_pack') return handleRemovePackModal(interaction, guildId);
      } catch (err) {
        logger.error('[Economy] Modal error:', err);
        try {
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ embeds: [errorEmbed('❌ Error', err.message || 'An error occurred.')], ephemeral: true });
          }
        } catch {}
      }
    },
  },
];

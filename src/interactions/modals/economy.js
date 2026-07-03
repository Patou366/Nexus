import { getEconomyConfig, saveEconomyConfig } from '../../services/economy.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { buildDashboardEmbed, buildDashboardRows } from '../../commands/Economy/economy-dashboard.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function refreshDashboard(interaction, guildId) {
  const updated = await getEconomyConfig(guildId);
  updated._guildId = guildId;
  await interaction.update({
    embeds: [buildDashboardEmbed(updated)],
    components: buildDashboardRows(updated, guildId),
  });
}

// ─── Currency ─────────────────────────────────────────────────────────────────
async function handleCurrencyModal(interaction, guildId) {
  const currencyName = interaction.fields.getTextInputValue('currencyName').trim();
  const currencyEmoji = interaction.fields.getTextInputValue('currencyEmoji').trim();

  if (!currencyName || !currencyEmoji) {
    return interaction.reply({ embeds: [errorEmbed('❌ Invalid Input', 'Currency name and emoji are required.')], ephemeral: true });
  }

  await saveEconomyConfig(guildId, { currencyName, currencyEmoji });
  await refreshDashboard(interaction, guildId);
}

// ─── Daily ────────────────────────────────────────────────────────────────────
async function handleDailyModal(interaction, guildId) {
  const dailyAmount = parseInt(interaction.fields.getTextInputValue('dailyAmount'));
  const dailyStreakBonus = parseInt(interaction.fields.getTextInputValue('dailyStreakBonus'));

  if (isNaN(dailyAmount) || dailyAmount < 1 || dailyAmount > 1000000) {
    return interaction.reply({ embeds: [errorEmbed('❌ Invalid Amount', 'Daily amount must be between 1 and 1,000,000.')], ephemeral: true });
  }
  if (isNaN(dailyStreakBonus) || dailyStreakBonus < 0 || dailyStreakBonus > 10000) {
    return interaction.reply({ embeds: [errorEmbed('❌ Invalid Bonus', 'Streak bonus must be between 0 and 10,000.')], ephemeral: true });
  }

  await saveEconomyConfig(guildId, { dailyAmount, dailyStreakBonus });
  await refreshDashboard(interaction, guildId);
}

// ─── Work ─────────────────────────────────────────────────────────────────────
async function handleWorkModal(interaction, guildId) {
  const workMin = parseInt(interaction.fields.getTextInputValue('workMin'));
  const workMax = parseInt(interaction.fields.getTextInputValue('workMax'));
  const cooldownHoursRaw = parseFloat(interaction.fields.getTextInputValue('workCooldownHours'));

  if (isNaN(workMin) || workMin < 1) {
    return interaction.reply({ embeds: [errorEmbed('❌ Invalid Min', 'Minimum reward must be at least 1.')], ephemeral: true });
  }
  if (isNaN(workMax) || workMax < workMin) {
    return interaction.reply({ embeds: [errorEmbed('❌ Invalid Max', 'Maximum reward must be ≥ minimum.')], ephemeral: true });
  }
  if (isNaN(cooldownHoursRaw) || cooldownHoursRaw < 0.1 || cooldownHoursRaw > 168) {
    return interaction.reply({ embeds: [errorEmbed('❌ Invalid Cooldown', 'Cooldown must be between 0.1 and 168 hours.')], ephemeral: true });
  }

  const workCooldown = Math.round(cooldownHoursRaw * 3600000);
  await saveEconomyConfig(guildId, { workMin, workMax, workCooldown });
  await refreshDashboard(interaction, guildId);
}

// ─── Rob ──────────────────────────────────────────────────────────────────────
async function handleRobModal(interaction, guildId) {
  const robCooldownMins = parseInt(interaction.fields.getTextInputValue('robCooldownMins'));
  const robSuccessRate = parseInt(interaction.fields.getTextInputValue('robSuccessRate'));

  if (isNaN(robCooldownMins) || robCooldownMins < 1 || robCooldownMins > 1440) {
    return interaction.reply({ embeds: [errorEmbed('❌ Invalid Cooldown', 'Cooldown must be between 1 and 1440 minutes.')], ephemeral: true });
  }
  if (isNaN(robSuccessRate) || robSuccessRate < 1 || robSuccessRate > 99) {
    return interaction.reply({ embeds: [errorEmbed('❌ Invalid Success Rate', 'Success rate must be between 1 and 99%.')], ephemeral: true });
  }

  const robCooldown = robCooldownMins * 60 * 1000;
  await saveEconomyConfig(guildId, { robCooldown, robSuccessRate });
  await refreshDashboard(interaction, guildId);
}

// ─── Message Coins ────────────────────────────────────────────────────────────
async function handleMsgCoinsModal(interaction, guildId) {
  const enabledRaw = interaction.fields.getTextInputValue('messageCoinsEnabled').trim().toLowerCase();
  const coinsPerMessage = parseInt(interaction.fields.getTextInputValue('coinsPerMessage'));
  const rateLimitSecs = parseInt(interaction.fields.getTextInputValue('messageCoinsRateLimitSecs'));

  const messageCoinsEnabled = enabledRaw === 'yes' || enabledRaw === 'true' || enabledRaw === '1';

  if (isNaN(coinsPerMessage) || coinsPerMessage < 1 || coinsPerMessage > 10000) {
    return interaction.reply({ embeds: [errorEmbed('❌ Invalid Amount', 'Coins per message must be between 1 and 10,000.')], ephemeral: true });
  }
  if (isNaN(rateLimitSecs) || rateLimitSecs < 5 || rateLimitSecs > 86400) {
    return interaction.reply({ embeds: [errorEmbed('❌ Invalid Cooldown', 'Cooldown must be between 5 and 86400 seconds.')], ephemeral: true });
  }

  const messageCoinsRateLimit = rateLimitSecs * 1000;
  await saveEconomyConfig(guildId, { messageCoinsEnabled, coinsPerMessage, messageCoinsRateLimit });
  await refreshDashboard(interaction, guildId);
}

// ─── Admin Notify Role ────────────────────────────────────────────────────────
async function handleAdminRoleModal(interaction, guildId) {
  const raw = interaction.fields.getTextInputValue('adminNotifyRoleId').trim();

  if (raw && !/^\d{17,20}$/.test(raw)) {
    return interaction.reply({ embeds: [errorEmbed('❌ Invalid Role ID', 'Please enter a valid Discord role ID (17–20 digit number), or leave blank to clear.')], ephemeral: true });
  }

  // Verify the role exists in this guild
  if (raw) {
    const role = interaction.guild?.roles.cache.get(raw) ||
      await interaction.guild?.roles.fetch(raw).catch(() => null);
    if (!role) {
      return interaction.reply({ embeds: [errorEmbed('❌ Role Not Found', `Could not find a role with ID \`${raw}\` in this server.`)], ephemeral: true });
    }
  }

  const adminNotifyRoleId = raw || null;
  await saveEconomyConfig(guildId, { adminNotifyRoleId });
  await refreshDashboard(interaction, guildId);
}

// ─── Add Pack ─────────────────────────────────────────────────────────────────
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

  await saveEconomyConfig(guildId, { packs });
  await refreshDashboard(interaction, guildId);
}

// ─── Remove Pack ──────────────────────────────────────────────────────────────
async function handleRemovePackModal(interaction, guildId) {
  const packInput = interaction.fields.getTextInputValue('packId').trim().toLowerCase();
  const config = await getEconomyConfig(guildId);
  const pack = (config.packs || []).find(p => p.id === packInput || p.name.toLowerCase() === packInput);

  if (!pack) {
    return interaction.reply({ embeds: [errorEmbed('❌ Not Found', `No pack found matching \`${packInput}\`.`)], ephemeral: true });
  }

  const packs = (config.packs || []).filter(p => p.id !== pack.id);
  await saveEconomyConfig(guildId, { packs });
  await refreshDashboard(interaction, guildId);
}

// ─── Add Shop Item ────────────────────────────────────────────────────────────
async function handleAddShopItemModal(interaction, guildId) {
  const itemName = interaction.fields.getTextInputValue('itemName').trim();
  const itemEmoji = interaction.fields.getTextInputValue('itemEmoji').trim();
  const itemPriceRaw = parseInt(interaction.fields.getTextInputValue('itemPrice'));
  const itemTypeRaw = interaction.fields.getTextInputValue('itemType').trim().toLowerCase();
  const itemRoleOrNote = interaction.fields.getTextInputValue('itemRoleOrNote').trim();

  if (!itemName) {
    return interaction.reply({ embeds: [errorEmbed('❌ Invalid Name', 'Item name is required.')], ephemeral: true });
  }
  if (isNaN(itemPriceRaw) || itemPriceRaw < 1) {
    return interaction.reply({ embeds: [errorEmbed('❌ Invalid Price', 'Price must be a positive number.')], ephemeral: true });
  }
  if (itemTypeRaw !== 'role' && itemTypeRaw !== 'custom') {
    return interaction.reply({ embeds: [errorEmbed('❌ Invalid Type', 'Type must be exactly `role` or `custom`.')], ephemeral: true });
  }

  let roleId = null;
  let deliveryNote = '';

  if (itemTypeRaw === 'role') {
    if (!itemRoleOrNote || !/^\d{17,20}$/.test(itemRoleOrNote)) {
      return interaction.reply({ embeds: [errorEmbed('❌ Invalid Role ID', 'For type `role`, you must provide a valid Discord role ID (17–20 digit number).')], ephemeral: true });
    }
    // Verify the role exists
    const role = interaction.guild?.roles.cache.get(itemRoleOrNote) ||
      await interaction.guild?.roles.fetch(itemRoleOrNote).catch(() => null);
    if (!role) {
      return interaction.reply({ embeds: [errorEmbed('❌ Role Not Found', `Could not find a role with ID \`${itemRoleOrNote}\` in this server.`)], ephemeral: true });
    }
    roleId = itemRoleOrNote;
  } else {
    deliveryNote = itemRoleOrNote;
  }

  const config = await getEconomyConfig(guildId);

  // Generate a unique ID: sanitised name + timestamp suffix
  const baseId = itemName.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 16);
  const itemId = `${baseId}_${Date.now().toString(36)}`;

  const newItem = {
    id: itemId,
    name: itemName,
    description: deliveryNote || (itemTypeRaw === 'role' ? `Get the role in the server` : 'Custom reward'),
    emoji: itemEmoji,
    price: itemPriceRaw,
    type: itemTypeRaw,
    roleId,
    deliveryNote,
  };

  const shopItems = [...(config.shopItems || []), newItem];
  await saveEconomyConfig(guildId, { shopItems });
  await refreshDashboard(interaction, guildId);
}

// ─── Remove Shop Item ─────────────────────────────────────────────────────────
async function handleRemoveShopItemModal(interaction, guildId) {
  const input = interaction.fields.getTextInputValue('shopItemId').trim().toLowerCase();
  const config = await getEconomyConfig(guildId);
  const item = (config.shopItems || []).find(i => i.id === input || i.name.toLowerCase() === input);

  if (!item) {
    return interaction.reply({ embeds: [errorEmbed('❌ Not Found', `No shop item found matching \`${input}\`.`)], ephemeral: true });
  }

  const shopItems = (config.shopItems || []).filter(i => i.id !== item.id);
  await saveEconomyConfig(guildId, { shopItems });
  await refreshDashboard(interaction, guildId);
}

// ─── Shop Style ───────────────────────────────────────────────────────────────
async function handleShopStyleModal(interaction, guildId) {
  const shopTitle = interaction.fields.getTextInputValue('shopTitle').trim();
  const shopColorRaw = interaction.fields.getTextInputValue('shopColor').trim();
  const shopFooter = interaction.fields.getTextInputValue('shopFooter').trim();

  if (!shopTitle) {
    return interaction.reply({ embeds: [errorEmbed('❌ Invalid Title', 'Shop title cannot be empty.')], ephemeral: true });
  }

  // Validate hex color
  if (!/^#[0-9A-Fa-f]{6}$/.test(shopColorRaw)) {
    return interaction.reply({ embeds: [errorEmbed('❌ Invalid Color', 'Color must be a valid 6-digit hex code, e.g. `#5865F2`.')], ephemeral: true });
  }

  await saveEconomyConfig(guildId, { shopTitle, shopColor: shopColorRaw, shopFooter });
  await refreshDashboard(interaction, guildId);
}

// ─── Jackpot Channel ──────────────────────────────────────────────────────────
async function handleJackpotChannelModal(interaction, guildId) {
  const raw = interaction.fields.getTextInputValue('jackpotChannelId').trim();
  const minBetRaw = parseInt(interaction.fields.getTextInputValue('jackpotMinBet'));

  if (isNaN(minBetRaw) || minBetRaw < 1) {
    return interaction.reply({ embeds: [errorEmbed('❌ Invalid Min Bet', 'Min bet must be at least 1.')], ephemeral: true });
  }

  if (raw && !/^\d{17,20}$/.test(raw)) {
    return interaction.reply({ embeds: [errorEmbed('❌ Invalid Channel ID', 'Please enter a valid Discord channel ID (17–20 digits), or leave blank to disable.')], ephemeral: true });
  }

  if (raw) {
    // Fetch from this guild's channels only — prevents cross-guild config injection
    const channel = await interaction.guild?.channels.fetch(raw).catch(() => null);
    if (!channel?.isTextBased()) {
      return interaction.reply({ embeds: [errorEmbed('❌ Channel Not Found', `Could not find a text channel with ID \`${raw}\` in this server. Make sure you paste a channel ID from **this server**.`)], ephemeral: true });
    }
  }

  await saveEconomyConfig(guildId, { jackpotChannelId: raw || null, jackpotMinBet: minBetRaw });
  await refreshDashboard(interaction, guildId);
}

// ─── Router ───────────────────────────────────────────────────────────────────
export default [
  {
    name: 'econ_modal',
    async execute(interaction, _client, args) {
      const action = args[0];
      const guildId = args[1] || interaction.guildId;

      try {
        if (action === 'currency')         return handleCurrencyModal(interaction, guildId);
        if (action === 'daily')            return handleDailyModal(interaction, guildId);
        if (action === 'work')             return handleWorkModal(interaction, guildId);
        if (action === 'rob')              return handleRobModal(interaction, guildId);
        if (action === 'msg_coins')        return handleMsgCoinsModal(interaction, guildId);
        if (action === 'admin_role')       return handleAdminRoleModal(interaction, guildId);
        if (action === 'add_pack')         return handleAddPackModal(interaction, guildId);
        if (action === 'remove_pack')      return handleRemovePackModal(interaction, guildId);
        if (action === 'add_shop_item')    return handleAddShopItemModal(interaction, guildId);
        if (action === 'remove_shop_item') return handleRemoveShopItemModal(interaction, guildId);
        if (action === 'shop_style')       return handleShopStyleModal(interaction, guildId);
        if (action === 'jackpot_channel')  return handleJackpotChannelModal(interaction, guildId);

        await interaction.reply({ embeds: [errorEmbed('❌ Unknown Action', 'Unknown modal action.')], ephemeral: true });
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

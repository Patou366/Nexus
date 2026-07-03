import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { getEconomyConfig, saveEconomyConfig, addPackToInventory } from '../../services/economy.js';
import { buildDashboardEmbed, buildDashboardRows } from '../../commands/Economy/economy-dashboard.js';

async function handlePackSpawnClaim(interaction, packId) {
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
      embeds: [successEmbed(`${pack.emoji} Pack Claimed!`, `You got a **${pack.name}**! Use \`/open-pack\` to open it.`)],
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

    // ── Toggle / Refresh ──────────────────────────────────────────────────────
    if (action === 'toggle') {
      const updated = await saveEconomyConfig(guildId, { enabled: !config.enabled });
      updated._guildId = guildId;
      return interaction.update({
        embeds: [buildDashboardEmbed(updated)],
        components: buildDashboardRows(updated, guildId),
      });
    }

    if (action === 'refresh') {
      return interaction.update({
        embeds: [buildDashboardEmbed(config)],
        components: buildDashboardRows(config, guildId),
      });
    }

    // ── Currency ──────────────────────────────────────────────────────────────
    if (action === 'edit_currency') {
      return interaction.showModal(
        new ModalBuilder()
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
          )
      );
    }

    // ── Daily ─────────────────────────────────────────────────────────────────
    if (action === 'edit_daily') {
      return interaction.showModal(
        new ModalBuilder()
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
          )
      );
    }

    // ── Work ──────────────────────────────────────────────────────────────────
    if (action === 'edit_work') {
      const cooldownHrs = ((config.workCooldown || 14400000) / 3600000).toFixed(1);
      return interaction.showModal(
        new ModalBuilder()
          .setCustomId(`econ_modal:work:${guildId}`)
          .setTitle('Edit Work Settings')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('workMin')
                .setLabel('Minimum Coins per Work')
                .setStyle(TextInputStyle.Short)
                .setValue(String(config.workMin || 50))
                .setMaxLength(7)
                .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('workMax')
                .setLabel('Maximum Coins per Work')
                .setStyle(TextInputStyle.Short)
                .setValue(String(config.workMax || 250))
                .setMaxLength(7)
                .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('workCooldownHours')
                .setLabel('Cooldown in Hours (e.g. 4 or 0.5)')
                .setStyle(TextInputStyle.Short)
                .setValue(cooldownHrs)
                .setMaxLength(6)
                .setRequired(true)
            )
          )
      );
    }

    // ── Rob ───────────────────────────────────────────────────────────────────
    if (action === 'edit_rob') {
      const cooldownMins = Math.round((config.robCooldown || 1800000) / 60000);
      return interaction.showModal(
        new ModalBuilder()
          .setCustomId(`econ_modal:rob:${guildId}`)
          .setTitle('Edit Rob Settings')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('robCooldownMins')
                .setLabel('Cooldown in Minutes (e.g. 30)')
                .setStyle(TextInputStyle.Short)
                .setValue(String(cooldownMins))
                .setMaxLength(4)
                .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('robSuccessRate')
                .setLabel('Success Rate % (1–99)')
                .setStyle(TextInputStyle.Short)
                .setValue(String(config.robSuccessRate ?? 45))
                .setMaxLength(3)
                .setRequired(true)
            )
          )
      );
    }

    // ── Message Coins ─────────────────────────────────────────────────────────
    if (action === 'edit_msg_coins') {
      const cooldownSecs = Math.round((config.messageCoinsRateLimit || 60000) / 1000);
      return interaction.showModal(
        new ModalBuilder()
          .setCustomId(`econ_modal:msg_coins:${guildId}`)
          .setTitle('Edit Message Coins')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('messageCoinsEnabled')
                .setLabel('Enabled? (yes / no)')
                .setStyle(TextInputStyle.Short)
                .setValue(config.messageCoinsEnabled ? 'yes' : 'no')
                .setMaxLength(3)
                .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('coinsPerMessage')
                .setLabel('Coins Per Message')
                .setStyle(TextInputStyle.Short)
                .setValue(String(config.coinsPerMessage || 5))
                .setMaxLength(6)
                .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('messageCoinsRateLimitSecs')
                .setLabel('Cooldown in Seconds (e.g. 60)')
                .setStyle(TextInputStyle.Short)
                .setValue(String(cooldownSecs))
                .setMaxLength(6)
                .setRequired(true)
            )
          )
      );
    }

    // ── Admin Notify Role ─────────────────────────────────────────────────────
    if (action === 'set_admin_role') {
      return interaction.showModal(
        new ModalBuilder()
          .setCustomId(`econ_modal:admin_role:${guildId}`)
          .setTitle('Set Admin Notify Role')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('adminNotifyRoleId')
                .setLabel('Role ID (paste the Discord role ID)')
                .setStyle(TextInputStyle.Short)
                .setValue(config.adminNotifyRoleId || '')
                .setMaxLength(20)
                .setPlaceholder('e.g. 1234567890123456789 (leave blank to clear)')
                .setRequired(false)
            )
          )
      );
    }

    // ── Add Pack ──────────────────────────────────────────────────────────────
    if (action === 'add_pack') {
      return interaction.showModal(
        new ModalBuilder()
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
          )
      );
    }

    // ── Remove Pack ───────────────────────────────────────────────────────────
    if (action === 'remove_pack') {
      return interaction.showModal(
        new ModalBuilder()
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
          )
      );
    }

    // ── Add Shop Item ─────────────────────────────────────────────────────────
    if (action === 'add_shop_item') {
      return interaction.showModal(
        new ModalBuilder()
          .setCustomId(`econ_modal:add_shop_item:${guildId}`)
          .setTitle('Add Shop Item')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('itemName')
                .setLabel('Item Name')
                .setStyle(TextInputStyle.Short)
                .setMaxLength(32)
                .setPlaceholder('e.g. VIP Role')
                .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('itemEmoji')
                .setLabel('Emoji')
                .setStyle(TextInputStyle.Short)
                .setMaxLength(8)
                .setPlaceholder('e.g. 👑')
                .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('itemPrice')
                .setLabel('Price (in coins)')
                .setStyle(TextInputStyle.Short)
                .setMaxLength(10)
                .setPlaceholder('e.g. 5000')
                .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('itemType')
                .setLabel('Type: "role" (auto-assign) or "custom"')
                .setStyle(TextInputStyle.Short)
                .setMaxLength(6)
                .setPlaceholder('role  OR  custom')
                .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('itemRoleOrNote')
                .setLabel('Role ID (role) or Delivery Note (custom)')
                .setStyle(TextInputStyle.Short)
                .setMaxLength(200)
                .setPlaceholder('Paste Role ID, or describe what the admin must do')
                .setRequired(false)
            )
          )
      );
    }

    // ── Remove Shop Item ──────────────────────────────────────────────────────
    if (action === 'remove_shop_item') {
      return interaction.showModal(
        new ModalBuilder()
          .setCustomId(`econ_modal:remove_shop_item:${guildId}`)
          .setTitle('Remove a Shop Item')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('shopItemId')
                .setLabel('Item ID or Name to Remove')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Enter the item ID or name')
                .setRequired(true)
            )
          )
      );
    }

    // ── Shop Style ────────────────────────────────────────────────────────────
    if (action === 'edit_shop_style') {
      return interaction.showModal(
        new ModalBuilder()
          .setCustomId(`econ_modal:shop_style:${guildId}`)
          .setTitle('Edit Shop Appearance')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('shopTitle')
                .setLabel('Shop Title')
                .setStyle(TextInputStyle.Short)
                .setValue(config.shopTitle || 'Server Shop')
                .setMaxLength(50)
                .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('shopColor')
                .setLabel('Embed Color (hex, e.g. #5865F2)')
                .setStyle(TextInputStyle.Short)
                .setValue(config.shopColor || '#5865F2')
                .setMaxLength(7)
                .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('shopFooter')
                .setLabel('Footer Text (leave blank for default)')
                .setStyle(TextInputStyle.Short)
                .setValue(config.shopFooter || '')
                .setMaxLength(100)
                .setRequired(false)
            )
          )
      );
    }

    // ── Jackpot Channel ───────────────────────────────────────────────────────
    if (action === 'set_jackpot_channel') {
      return interaction.showModal(
        new ModalBuilder()
          .setCustomId(`econ_modal:jackpot_channel:${guildId}`)
          .setTitle('Set Jackpot Announcement Channel')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('jackpotChannelId')
                .setLabel('Channel ID (leave blank to disable)')
                .setStyle(TextInputStyle.Short)
                .setValue(config.jackpotChannelId || '')
                .setMaxLength(20)
                .setPlaceholder('e.g. 1234567890123456789')
                .setRequired(false)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('jackpotMinBet')
                .setLabel('Min bet to trigger announcement')
                .setStyle(TextInputStyle.Short)
                .setValue(String(config.jackpotMinBet || 100))
                .setMaxLength(7)
                .setPlaceholder('e.g. 100')
                .setRequired(true)
            )
          )
      );
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
      await handlePackSpawnClaim(interaction, packId);
    },
  },
];

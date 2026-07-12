import { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { createEmbed, errorEmbed } from '../../utils/embeds.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getEconomyConfig } from '../../services/economy.js';

export function buildDashboardEmbed(config) {
  const packList = (config.packs || [])
    .map((p, i) =>
      `**${i + 1}. ${p.emoji} ${p.name}** — ${p.price.toLocaleString()} ${config.currencyEmoji}\n` +
      `  *${p.description}*`
    )
    .join('\n') || '*No packs configured.*';

  const shopList = (config.shopItems || [])
    .map((item, i) => {
      const typeTag = item.type === 'role' ? '🏷️ Role' : '✨ Custom';
      return `**${i + 1}. ${item.emoji} ${item.name}** — ${item.price.toLocaleString()} ${config.currencyEmoji} (${typeTag})`;
    })
    .join('\n') || '*No shop items configured.*';

  const workCooldownHrs = Math.round((config.workCooldown || 14400000) / 3600000 * 10) / 10;
  const robCooldownMins = Math.round((config.robCooldown || 1800000) / 60000);
  const msgCooldownSecs = Math.round((config.messageCoinsRateLimit || 60000) / 1000);
  const adminRole = config.adminNotifyRoleId ? `<@&${config.adminNotifyRoleId}>` : '*Not set*';

  return createEmbed({
    title: '⚙️ Economy Dashboard',
    description: 'Configure the full economy system for this server.\n\u200b',
    color: 'primary',
    fields: [
      {
        name: '💰 Currency',
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
          `**Streak Bonus:** +${config.dailyStreakBonus}/day\n` +
          `**Max Bonus:** +${Math.min(30, 30) * config.dailyStreakBonus} (30 days)`,
        inline: true,
      },
      {
        name: '💬 Message Coins',
        value:
          `**Status:** ${config.messageCoinsEnabled ? '✅ Enabled' : '❌ Disabled'}\n` +
          `**Per Message:** ${config.coinsPerMessage || 5} ${config.currencyEmoji}\n` +
          `**Cooldown:** ${msgCooldownSecs}s between awards`,
        inline: true,
      },
      {
        name: '💼 Work',
        value:
          `**Reward:** ${config.workMin || 50}–${config.workMax || 250} ${config.currencyEmoji}\n` +
          `**Cooldown:** ${workCooldownHrs}h`,
        inline: true,
      },
      {
        name: '🦹 Rob',
        value:
          `**Cooldown:** ${robCooldownMins}m\n` +
          `**Success Rate:** ${config.robSuccessRate ?? 45}%`,
        inline: true,
      },
      {
        name: '🔔 Admin Notify Role',
        value: adminRole,
        inline: true,
      },
      {
        name: '🎰 Jackpot Channel',
        value: config.jackpotChannelId
          ? `<#${config.jackpotChannelId}> (min bet: ${(config.jackpotMinBet || 100).toLocaleString()})`
          : '*Not set — jackpots are silent*',
        inline: true,
      },
      {
        name: '\u200b',
        value: '\u200b',
        inline: false,
      },
      {
        name: '🛍️ Shop Style',
        value:
          `**Title:** ${config.shopTitle || 'Server Shop'}\n` +
          `**Color:** ${config.shopColor || '#5865F2'}\n` +
          `**Footer:** ${config.shopFooter || '*default*'}`,
        inline: true,
      },
      {
        name: `📦 Packs (${(config.packs || []).length})`,
        value: packList.substring(0, 500),
        inline: false,
      },
      {
        name: `🛒 Shop Items (${(config.shopItems || []).length})`,
        value: shopList.substring(0, 500),
        inline: false,
      },
    ],
    footer: { text: 'Use the buttons below to edit settings • Changes save immediately • 🧪 In beta (Testing)' },
  });
}

export function buildDashboardRows(config, guildId) {
  const gid = guildId || config._guildId || 'guild';
  const hasItems = (config.shopItems || []).length > 0;
  const hasPacks = (config.packs || []).length > 0;

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`econ_dashboard:toggle:${gid}`)
      .setLabel(config.enabled ? 'Disable Economy' : 'Enable Economy')
      .setStyle(config.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`econ_dashboard:edit_currency:${gid}`)
      .setLabel('Edit Currency')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`econ_dashboard:edit_daily:${gid}`)
      .setLabel('Edit Daily Reward')
      .setStyle(ButtonStyle.Primary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`econ_dashboard:edit_work:${gid}`)
      .setLabel('Edit Work')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`econ_dashboard:edit_rob:${gid}`)
      .setLabel('Edit Rob')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`econ_dashboard:edit_msg_coins:${gid}`)
      .setLabel('Edit Message Coins')
      .setStyle(ButtonStyle.Primary)
  );

  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`econ_dashboard:add_pack:${gid}`)
      .setLabel('Add Pack')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`econ_dashboard:remove_pack:${gid}`)
      .setLabel('Remove Pack')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!hasPacks),
    new ButtonBuilder()
      .setCustomId(`econ_dashboard:set_admin_role:${gid}`)
      .setLabel('Set Admin Role')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`econ_dashboard:set_jackpot_channel:${gid}`)
      .setLabel('🎰 Jackpot Channel')
      .setStyle(ButtonStyle.Secondary)
  );

  const row4 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`econ_dashboard:add_shop_item:${gid}`)
      .setLabel('Add Shop Item')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`econ_dashboard:remove_shop_item:${gid}`)
      .setLabel('Remove Shop Item')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!hasItems),
    new ButtonBuilder()
      .setCustomId(`econ_dashboard:edit_shop_style:${gid}`)
      .setLabel('Edit Shop Style')
      .setStyle(ButtonStyle.Secondary)
  );

  const row5 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`econ_dashboard:refresh:${gid}`)
      .setLabel('🔄 Refresh')
      .setStyle(ButtonStyle.Secondary)
  );

  return [row1, row2, row3, row4, row5];
}

export default {
  data: new SlashCommandBuilder()
    .setName('economy-dashboard')
    .setDescription('(Admin) Open the economy configuration dashboard')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false),

  async execute(interaction) {
    const deferSuccess = await InteractionHelper.safeDefer(interaction, { ephemeral: true });
    if (!deferSuccess) return;

    try {
      const guildId = interaction.guildId;
      const config = await getEconomyConfig(guildId);
      config._guildId = guildId;

      await InteractionHelper.safeEditReply(interaction, {
        embeds: [buildDashboardEmbed(config)],
        components: buildDashboardRows(config, guildId),
      });
    } catch (error) {
      await handleInteractionError(interaction, error, { type: 'command', commandName: 'economy-dashboard' });
    }
  },
};

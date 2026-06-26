import { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed } from '../../utils/embeds.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
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
          `**Streak Bonus:** +${config.dailyStreakBonus}/day\n` +
          `**Max Streak Bonus:** +${Math.min(30, 30) * config.dailyStreakBonus} (30 days)`,
        inline: true,
      },
      {
        name: '\u200b',
        value: '\u200b',
        inline: false,
      },
      {
        name: `📦 Packs (${(config.packs || []).length})`,
        value: packList.substring(0, 1000),
        inline: false,
      },
    ],
    footer: { text: 'Use the buttons below to edit settings • Changes save immediately' },
  });
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
      const embed = buildDashboardEmbed(config);

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

      await InteractionHelper.safeEditReply(interaction, {
        embeds: [embed],
        components: [row1, row2],
      });
    } catch (error) {
      await handleInteractionError(interaction, error, { type: 'command', commandName: 'economy-dashboard' });
    }
  },
};

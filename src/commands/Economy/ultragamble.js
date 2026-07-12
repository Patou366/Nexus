import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed } from '../../utils/embeds.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { playUltraGamble, getEconomyConfig } from '../../services/economy.js';

const OUTCOME_COLORS = {
  error:   0xe74c3c,
  warning: 0xf39c12,
  success: 0x2ecc71,
};

const OUTCOME_BANNERS = {
  wipeout: '```\n💀  W I P E O U T  💀\n```',
  inferno: '```\n🔥  I N F E R N O  🔥\n```',
  shock:   '```\n⚡   S H O C K   ⚡\n```',
  sharp:   '```\n🎯   S H A R P   🎯\n```',
  diamond: '```\n💎  D I A M O N D  💎\n```',
  royal:   '```\n👑   R O Y A L   👑\n```',
  cosmic:  '```\n🌌  C O S M I C  🌌\n```',
  ultra:   '```\n🌟 U L T R A  J A C K P O T 🌟\n```',
};

export default {
  data: new SlashCommandBuilder()
    .setName('ultragamble')
    .setDescription('⚠️ Ultra high-stakes gambling — up to 50x your bet or total wipeout!')
    .setDMPermission(false)
    .addIntegerOption(opt =>
      opt
        .setName('bet')
        .setDescription('Amount to bet (minimum 100 coins)')
        .setRequired(true)
        .setMinValue(100)
    ),

  async execute(interaction) {
    const deferSuccess = await InteractionHelper.safeDefer(interaction);
    if (!deferSuccess) return;

    try {
      const guildId = interaction.guildId;
      const userId = interaction.user.id;
      const bet = interaction.options.getInteger('bet');
      const config = await getEconomyConfig(guildId);

      const result = await playUltraGamble(guildId, userId, bet);

      if (!result.success) {
        return InteractionHelper.safeEditReply(interaction, {
          embeds: [errorEmbed(
            `❌ Not Enough ${config.currencyName}`,
            `You need at least **${bet.toLocaleString()} ${config.currencyEmoji}** to ultra gamble.\n` +
            `Your wallet: **${(result.have || 0).toLocaleString()} ${config.currencyEmoji}**`
          )],
        });
      }

      const { outcome, netChange, newCoins } = result;
      const banner = OUTCOME_BANNERS[outcome.id];
      const color = OUTCOME_COLORS[outcome.color] ?? OUTCOME_COLORS.error;

      const changeText = netChange >= 0
        ? `✨ **+${netChange.toLocaleString()} ${config.currencyEmoji}** profit!`
        : `💸 **-${Math.abs(netChange).toLocaleString()} ${config.currencyEmoji}** lost.`;

      const multiplierText = outcome.multiplier === 0
        ? 'Multiplier: **☠️ ×0**'
        : outcome.multiplier < 1
          ? `Multiplier: **×${outcome.multiplier}** (partial return)`
          : `Multiplier: **×${outcome.multiplier}**`;

      const embed = createEmbed({
        title: '⚠️ ULTRA GAMBLE',
        description:
          '⚠️ **ULTRA GAMBLING** — 🧪 **IN BETA (TESTING)** ⚠️\n\n' +
          banner + '\n' +
          `${outcome.desc}\n\n` +
          `${changeText}\n` +
          `${multiplierText}\n\n` +
          `**Bet:** ${bet.toLocaleString()} ${config.currencyEmoji}\n` +
          `**Payout:** ${result.winnings.toLocaleString()} ${config.currencyEmoji}\n` +
          `💰 **New balance:** ${newCoins.toLocaleString()} ${config.currencyName}`,
        color: outcome.color,
        footer: { text: `Odds: 💀20% | 🔥20% | ⚡10% | 🎯15% | 💎12% | 👑10% | 🌌8% | 🌟5% • 🧪 In beta (Testing)` },
        thumbnail: interaction.user.displayAvatarURL({ size: 64 }),
      });

      // Override the color manually since createEmbed uses named color keys
      embed.setColor(color);

      await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });

      // ── Announce cosmic / ultra wins ──────────────────────────────────────
      if ((outcome.id === 'ultra' || outcome.id === 'cosmic') && config.jackpotChannelId) {
        try {
          const channel = await interaction.guild?.channels.fetch(config.jackpotChannelId).catch(() => null);
          if (channel?.isTextBased() && channel.guildId === guildId) {
            const announceEmbed = createEmbed({
              title: outcome.id === 'ultra' ? '🌟 ULTRA JACKPOT! 🌟' : '🌌 COSMIC WIN! 🌌',
              description:
                `🎊 ${interaction.user} just hit **${outcome.label}** on \`/ultragamble\`!\n\n` +
                `💰 They turned **${bet.toLocaleString()} ${config.currencyEmoji}** into ` +
                `**${result.winnings.toLocaleString()} ${config.currencyEmoji}** (**×${outcome.multiplier}**!)` +
                `\n\n*Think you can beat that? Try \`/ultragamble\`!*`,
              color: 'success',
              thumbnail: interaction.user.displayAvatarURL({ size: 128 }),
              footer: { text: '🧪 In beta (Testing)' },
            });
            await channel.send({ embeds: [announceEmbed] });
          }
        } catch { /* never fail the command because of an announcement */ }
      }

    } catch (error) {
      await handleInteractionError(interaction, error, { type: 'command', commandName: 'ultragamble' });
    }
  },
};

import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { errorEmbed } from '../../utils/embeds.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { playUltraGamble, getEconomyConfig } from '../../services/economy.js';

// Per-outcome styling
const OUTCOME_STYLE = {
  wipeout: {
    color: 0x2c2c2c,
    title: '💀  W I P E O U T',
    flavor: [
      'Gone. All of it. Not even crumbs.',
      'The house took every last coin. Get up.',
      'Your wallet is now a crime scene.',
      'Absolutely nothing. You had a good run.',
    ],
  },
  inferno: {
    color: 0xe74c3c,
    title: '🔥  I N F E R N O',
    flavor: [
      'The fire took 75% and left the rest as a taunt.',
      'Burned alive. At least you survived... barely.',
      'Three-quarters gone. The embers mock you.',
      'Scorched. You walked out with ash.',
    ],
  },
  shock: {
    color: 0xf39c12,
    title: '⚡  S H O C K',
    flavor: [
      'Exactly what you put in. The universe is neutral today.',
      'Not a win. Not a loss. A humbling draw.',
      'The machine handed it back like nothing happened.',
      'You stared into the void and the void blinked first.',
    ],
  },
  sharp: {
    color: 0x27ae60,
    title: '🎯  S H A R P',
    flavor: [
      'Clean double. Calculated and ruthless.',
      'Two times the bet — straight to your wallet.',
      'Precision. You knew what you were doing.',
      'The house is annoyed. You doubled up.',
    ],
  },
  diamond: {
    color: 0x1abc9c,
    title: '💎  D I A M O N D',
    flavor: [
      'Five times your bet. Absolutely sparkling.',
      'A diamond hit — rare, sharp, and worth it.',
      'The machine wheezed and spat out a ×5.',
      '5x. The crowd goes quiet with envy.',
    ],
  },
  royal: {
    color: 0x9b59b6,
    title: '👑  R O Y A L',
    flavor: [
      '10x. You are untouchable right now.',
      'Royal treatment — ten times what you risked.',
      'The house bows. A genuine ×10 hit.',
      'Crown on your head. 10x in your wallet.',
    ],
  },
  cosmic: {
    color: 0x3498db,
    title: '🌌  C O S M I C',
    flavor: [
      '20x. The universe bent the rules for you.',
      'Cosmic alignment — twenty times your bet.',
      'Astronomical. Barely anyone sees this.',
      'The stars aligned. ×20 lands in your account.',
    ],
  },
  ultra: {
    color: 0xf1c40f,
    title: '🌟  U L T R A   J A C K P O T',
    flavor: [
      '50x. You have absolutely lost your mind — and won.',
      'ULTRA JACKPOT. This happens to almost no one.',
      'The rarest outcome on the wheel. You somehow hit it.',
      '×50. The machine is broken and you are the reason.',
    ],
  },
};

function pickFlavor(outcome) {
  const lines = OUTCOME_STYLE[outcome.id]?.flavor || ['...'];
  return lines[Math.floor(Math.random() * lines.length)];
}

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
      const guildId  = interaction.guildId;
      const userId   = interaction.user.id;
      const bet      = interaction.options.getInteger('bet');
      const config   = await getEconomyConfig(guildId);
      const result   = await playUltraGamble(guildId, userId, bet);

      // ── Insufficient funds ────────────────────────────────────────────────
      if (!result.success) {
        return InteractionHelper.safeEditReply(interaction, {
          embeds: [errorEmbed(
            `❌ Not Enough ${config.currencyName}`,
            `You need **${bet.toLocaleString()} ${config.currencyEmoji}** to enter.\n` +
            `Your wallet: **${(result.have || 0).toLocaleString()} ${config.currencyEmoji}**`
          )],
        });
      }

      const { outcome, netChange, newCoins } = result;
      const style   = OUTCOME_STYLE[outcome.id];
      const flavor  = pickFlavor(outcome);
      const isWin   = netChange > 0;
      const isEven  = netChange === 0;

      const netLabel = isWin
        ? `+${netChange.toLocaleString()} ${config.currencyEmoji}`
        : isEven
          ? `±0 ${config.currencyEmoji}`
          : `-${Math.abs(netChange).toLocaleString()} ${config.currencyEmoji}`;

      const netPrefix = isWin ? '📈' : isEven ? '➡️' : '📉';

      const embed = new EmbedBuilder()
        .setColor(style.color)
        .setAuthor({
          name: `${interaction.user.displayName} rolled the Ultra Gamble`,
          iconURL: interaction.user.displayAvatarURL({ size: 64 }),
        })
        .setTitle(style.title)
        .setDescription(
          '⚠️ **ULTRA GAMBLING**  •  🧪 **IN BETA (TESTING)**  ⚠️\n' +
          '─────────────────────────────\n\n' +
          `*${flavor}*`
        )
        .addFields(
          {
            name: '🎰 Bet',
            value: `**${bet.toLocaleString()}** ${config.currencyEmoji}`,
            inline: true,
          },
          {
            name: '💰 Payout',
            value: `**${result.winnings.toLocaleString()}** ${config.currencyEmoji}`,
            inline: true,
          },
          {
            name: '📊 Multiplier',
            value: outcome.multiplier === 0 ? '**☠️ ×0**' : `**×${outcome.multiplier}**`,
            inline: true,
          },
          {
            name: `${netPrefix} Net Change`,
            value: `**${netLabel}**`,
            inline: true,
          },
          {
            name: '👛 New Balance',
            value: `**${newCoins.toLocaleString()}** ${config.currencyName}`,
            inline: true,
          },
          {
            name: '\u200b',
            value: '\u200b',
            inline: true,
          },
          {
            name: '📋 Odds Table',
            value:
              '`💀 Wipeout` ×0 — **20%**\n' +
              '`🔥 Inferno` ×0.25 — **20%**\n' +
              '`⚡ Shock` ×1 — **10%**\n' +
              '`🎯 Sharp` ×2 — **15%**\n' +
              '`💎 Diamond` ×5 — **12%**\n' +
              '`👑 Royal` ×10 — **10%**\n' +
              '`🌌 Cosmic` ×20 — **8%**\n' +
              '`🌟 Ultra Jackpot` ×50 — **5%**',
            inline: false,
          }
        )
        .setFooter({ text: '🧪 In beta (Testing) — Ultra Gamble' })
        .setTimestamp();

      await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });

      // ── Announce cosmic / ultra wins in jackpot channel ───────────────────
      if ((outcome.id === 'ultra' || outcome.id === 'cosmic') && config.jackpotChannelId) {
        try {
          const channel = await interaction.guild?.channels.fetch(config.jackpotChannelId).catch(() => null);
          if (channel?.isTextBased() && channel.guildId === guildId) {
            const announceEmbed = new EmbedBuilder()
              .setColor(style.color)
              .setTitle(outcome.id === 'ultra' ? '🌟 ULTRA JACKPOT HIT! 🌟' : '🌌 COSMIC WIN! 🌌')
              .setDescription(
                `🎊 ${interaction.user} just landed **${style.title.trim()}** on \`/ultragamble\`!\n\n` +
                `They turned **${bet.toLocaleString()} ${config.currencyEmoji}** into ` +
                `**${result.winnings.toLocaleString()} ${config.currencyEmoji}** at **×${outcome.multiplier}**!\n\n` +
                `*Think you can do it? Try \`/ultragamble\`!*`
              )
              .setThumbnail(interaction.user.displayAvatarURL({ size: 128 }))
              .setFooter({ text: '🧪 In beta (Testing)' })
              .setTimestamp();
            await channel.send({ embeds: [announceEmbed] });
          }
        } catch { /* never fail the command over an announcement */ }
      }

    } catch (error) {
      await handleInteractionError(interaction, error, { type: 'command', commandName: 'ultragamble' });
    }
  },
};

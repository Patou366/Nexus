import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { getLeaderboard, getLevelingConfig, getXpForLevel } from '../../services/leveling.js';
import { getEconomyConfig, getEconomyLeaderboard } from '../../services/economy.js';
import { getQLeaderboard } from '../../services/questionService.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription("View the server leaderboard")
    .setDMPermission(false)
    .addStringOption(opt =>
      opt.setName('type')
        .setDescription('Which leaderboard to view (default: levels)')
        .setRequired(false)
        .addChoices(
          { name: '⚔️ Levels', value: 'levels' },
          { name: '💰 Richest', value: 'coins' },
          { name: '🧠 Trivia', value: 'trivia' },
        )
    ),
  category: 'Leveling',

  async execute(interaction, config, client) {
    try {
      await InteractionHelper.safeDefer(interaction);
      const type = interaction.options.getString('type') || 'levels';

      // ── Levels leaderboard ──────────────────────────────────────────────
      if (type === 'levels') {
        const levelingConfig = await getLevelingConfig(client, interaction.guildId);
        if (!levelingConfig?.enabled) {
          return InteractionHelper.safeEditReply(interaction, {
            embeds: [
              new EmbedBuilder()
                .setColor('#f1c40f')
                .setDescription('The leveling system is currently disabled on this server.')
            ],
          });
        }

        const leaderboard = await getLeaderboard(client, interaction.guildId, 10);
        if (leaderboard.length === 0) {
          throw new TitanBotError(
            'No leaderboard data found',
            ErrorTypes.DATABASE,
            'No level data found yet. Start chatting to gain XP!'
          );
        }

        const lines = await Promise.all(
          leaderboard.map(async (user, index) => {
            const member = await interaction.guild.members.fetch(user.userId).catch(() => null);
            const mention = member?.user.toString() || `<@${user.userId}>`;
            const xpNext = getXpForLevel(user.level + 1);
            let prefix = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `**${index + 1}.**`;
            return `${prefix} ${mention} — Level ${user.level} (${user.xp}/${xpNext} XP)`;
          })
        );

        const embed = new EmbedBuilder()
          .setTitle('⚔️ Level Leaderboard')
          .setColor('#2ecc71')
          .setDescription('Top 10 most active members:\n\n' + lines.join('\n'))
          .setTimestamp();

        return InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
      }

      // ── Coins leaderboard ───────────────────────────────────────────────
      if (type === 'coins') {
        const econConfig = await getEconomyConfig(interaction.guildId);
        const top = await getEconomyLeaderboard(interaction.guildId, 10);

        if (top.length === 0) {
          return InteractionHelper.safeEditReply(interaction, {
            embeds: [
              new EmbedBuilder()
                .setTitle(`${econConfig.currencyEmoji} Richest Members`)
                .setDescription('Nobody has any coins yet! Use `/daily` or `/work` to get started.')
                .setColor('#f1c40f')
                .setTimestamp()
            ],
          });
        }

        const lines = await Promise.all(
          top.map(async ({ userId, coins }, index) => {
            const member = await interaction.guild.members.fetch(userId).catch(() => null);
            const mention = member?.user.toString() || `<@${userId}>`;
            let prefix = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `**${index + 1}.**`;
            return `${prefix} ${mention} — **${coins.toLocaleString()} ${econConfig.currencyEmoji}**`;
          })
        );

        const embed = new EmbedBuilder()
          .setTitle(`${econConfig.currencyEmoji} Richest Members`)
          .setColor('#f1c40f')
          .setDescription('Top 10 wealthiest members:\n\n' + lines.join('\n'))
          .setTimestamp();

        return InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
      }

      // ── Trivia leaderboard ──────────────────────────────────────────────
      if (type === 'trivia') {
        const top = await getQLeaderboard(interaction.guildId, 10);

        if (top.length === 0) {
          return InteractionHelper.safeEditReply(interaction, {
            embeds: [
              new EmbedBuilder()
                .setTitle('🧠 Trivia Leaderboard')
                .setDescription('No scores yet! Use `/question` to start competing.')
                .setColor('#3498db')
                .setTimestamp()
            ],
          });
        }

        const lines = await Promise.all(
          top.map(async ({ userId, score }, index) => {
            const member = await interaction.guild.members.fetch(userId).catch(() => null);
            const mention = member?.user.toString() || `<@${userId}>`;
            let prefix = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `**${index + 1}.**`;
            return `${prefix} ${mention} — **${score}** correct answer${score !== 1 ? 's' : ''}`;
          })
        );

        const embed = new EmbedBuilder()
          .setTitle('🧠 Trivia Leaderboard')
          .setColor('#3498db')
          .setDescription('Top players by correct `/question` answers:\n\n' + lines.join('\n'))
          .setFooter({ text: `${top.length} player${top.length !== 1 ? 's' : ''} on the board` })
          .setTimestamp();

        return InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
      }

    } catch (error) {
      logger.error('Leaderboard command error:', error);
      await handleInteractionError(interaction, error, { type: 'command', commandName: 'leaderboard' });
    }
  }
};

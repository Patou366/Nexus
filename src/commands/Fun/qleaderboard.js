import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getQLeaderboard } from '../../services/questionService.js';

export default {
    data: new SlashCommandBuilder()
        .setName('qleaderboard')
        .setDescription('Top 10 players with the most correct /question answers')
        .setDMPermission(false),

    category: 'Fun',

    async execute(interaction, config, client) {
        try {
            await InteractionHelper.safeDefer(interaction);

            const top = await getQLeaderboard(interaction.guildId, 10);

            if (top.length === 0) {
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        new EmbedBuilder()
                            .setTitle('🧠 Question Leaderboard')
                            .setDescription('No scores yet! Use `/question` to get started.')
                            .setColor('#3498db')
                            .setTimestamp()
                    ]
                });
            }

            const lines = await Promise.all(
                top.map(async ({ userId, score }, index) => {
                    const member = await interaction.guild.members.fetch(userId).catch(() => null);
                    const display = member?.user.toString() || `<@${userId}>`;

                    let prefix;
                    if      (index === 0) prefix = '🥇';
                    else if (index === 1) prefix = '🥈';
                    else if (index === 2) prefix = '🥉';
                    else                  prefix = `**${index + 1}.**`;

                    return `${prefix} ${display} — **${score}** correct answer${score !== 1 ? 's' : ''}`;
                })
            );

            const embed = new EmbedBuilder()
                .setTitle('🧠 Question Leaderboard')
                .setDescription('Top players by correct `/question` answers:\n\n' + lines.join('\n'))
                .setColor('#3498db')
                .setFooter({ text: `${top.length} player${top.length !== 1 ? 's' : ''} on the board` })
                .setTimestamp();

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
            logger.debug(`qleaderboard displayed for guild ${interaction.guildId}`);
        } catch (error) {
            logger.error('qleaderboard command error:', error);
            await handleInteractionError(interaction, error, { commandName: 'qleaderboard' });
        }
    }
};

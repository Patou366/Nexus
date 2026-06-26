import { MessageFlags } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { activeDebates } from '../../services/debateService.js';
import { buildDebateEmbed, buildDebateRow } from '../../commands/Fun/debate.js';

export default {
    name: 'debate_vote',

    /**
     * args = [messageId, side]  where side = 'for' | 'against'
     */
    async execute(interaction, client, args) {
        try {
            const [messageId, side] = args;

            const state = activeDebates.get(messageId);
            if (!state) {
                return await interaction.reply({
                    content: '⏰ This debate has already closed. / Este debate ya cerró.',
                    flags: MessageFlags.Ephemeral
                });
            }

            const userId = interaction.user.id;
            const alreadyFor     = state.forVoters.has(userId);
            const alreadyAgainst = state.againstVoters.has(userId);

            if (side === 'for') {
                if (alreadyFor) {
                    return await interaction.reply({
                        content: '✅ You\'re already voting **For** this topic! / ¡Ya estás votando **A favor**!',
                        flags: MessageFlags.Ephemeral
                    });
                }
                // Switch from against → for
                state.againstVoters.delete(userId);
                state.forVoters.add(userId);
            } else {
                if (alreadyAgainst) {
                    return await interaction.reply({
                        content: '✅ You\'re already voting **Against** this topic! / ¡Ya estás votando **En contra**!',
                        flags: MessageFlags.Ephemeral
                    });
                }
                // Switch from for → against
                state.forVoters.delete(userId);
                state.againstVoters.add(userId);
            }

            const forCount     = state.forVoters.size;
            const againstCount = state.againstVoters.size;
            const switched     = (side === 'for' && alreadyAgainst) || (side === 'against' && alreadyFor);

            // Compute remaining minutes from stored endsAt timestamp
            const minsLeft = Math.max(1, Math.ceil((state.endsAt - Date.now()) / 60000));

            // Update the original message with fresh counts
            await interaction.message.edit({
                embeds: [buildDebateEmbed(state.topic, forCount, againstCount, minsLeft, false)],
                components: [buildDebateRow(messageId, forCount, againstCount)]
            }).catch(err => logger.warn(`Failed to update debate embed ${messageId}:`, err.message));

            const sideLabel = side === 'for' ? '👍 For / A favor' : '👎 Against / En contra';
            const reply     = switched
                ? `🔄 Switched your vote to **${sideLabel}**!`
                : `✅ Voted **${sideLabel}**!`;

            await interaction.reply({ content: reply, flags: MessageFlags.Ephemeral });

            logger.debug(`Debate vote: user ${userId} voted ${side} on msg ${messageId} (forTotal=${forCount}, againstTotal=${againstCount})`);
        } catch (error) {
            logger.error('debateVote button error:', error);
            try {
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({
                        content: '❌ Something went wrong. Please try again.',
                        flags: MessageFlags.Ephemeral
                    });
                }
            } catch { /* ignore */ }
        }
    }
};

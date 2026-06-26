import { MessageFlags } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { activeQuestions, incrementQScore } from '../../services/questionService.js';

const OPTION_LABELS = ['A', 'B', 'C'];

export default {
    name: 'q_answer',

    /**
     * args = [messageId, optionIndex]  (split from custom ID by ':')
     */
    async execute(interaction, client, args) {
        try {
            const [messageId, indexStr] = args;
            const chosenIndex = parseInt(indexStr, 10);

            // Look up the active question
            const state = activeQuestions.get(messageId);
            if (!state) {
                return await interaction.reply({
                    content: '⏰ This question has already closed. / Esta pregunta ya cerró.',
                    flags: MessageFlags.Ephemeral
                });
            }

            const userId = interaction.user.id;

            // One answer per user
            if (state.answeredUsers.has(userId)) {
                return await interaction.reply({
                    content: '🚫 You already answered this question! / ¡Ya respondiste esta pregunta!',
                    flags: MessageFlags.Ephemeral
                });
            }

            state.answeredUsers.add(userId);

            const chosenLabel  = OPTION_LABELS[chosenIndex];
            const chosenOption = state.options[chosenIndex];
            const isCorrect    = chosenIndex === state.correctIndex;

            if (isCorrect) {
                state.correctUsers.add(userId);
                const newTotal = await incrementQScore(state.guildId, userId);
                const totalStr = newTotal !== null ? ` Your total: **${newTotal}** correct answer${newTotal !== 1 ? 's' : ''}.` : '';

                await interaction.reply({
                    content: `✅ **Correct!** You picked **${chosenLabel}) ${chosenOption}**.${totalStr}`,
                    flags: MessageFlags.Ephemeral
                });
            } else {
                const correctLabel  = OPTION_LABELS[state.correctIndex];
                const correctOption = state.options[state.correctIndex];
                await interaction.reply({
                    content: `❌ **Wrong!** You picked **${chosenLabel}) ${chosenOption}**. The correct answer will be revealed when time is up. / ¡Incorrecto! La respuesta correcta se revelará cuando se acabe el tiempo.`,
                    flags: MessageFlags.Ephemeral
                });
            }

            logger.debug(`Question answer: user ${userId} picked ${chosenLabel} (${isCorrect ? 'correct' : 'wrong'}) on msg ${messageId}`);
        } catch (error) {
            logger.error('questionAnswer button error:', error);
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

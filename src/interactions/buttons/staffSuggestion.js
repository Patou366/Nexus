import { MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';

const VOTE_IDS = ['staff_suggestion_upvote', 'staff_suggestion_downvote', 'staff_suggestion_neutral'];

const LABELS = {
    staff_suggestion_upvote:   { emoji: '👍', name: 'Support / Apoyar',    color: 'success' },
    staff_suggestion_downvote: { emoji: '👎', name: 'Oppose / Oponerse',   color: 'error' },
    staff_suggestion_neutral:  { emoji: '🤔', name: 'Neutral',             color: 'gray' }
};

async function handleVote(interaction) {
    try {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const voteType = interaction.customId;
        const label = LABELS[voteType];
        const message = interaction.message;

        const embed = message.embeds[0];
        if (!embed) {
            return await interaction.editReply({
                embeds: [createEmbed({
                    title: 'Error',
                    description: 'Could not find the suggestion embed.',
                    color: 'error'
                })]
            });
        }

        const existingFields = embed.fields || [];
        const votesField = existingFields.find(f => f.name.startsWith('Votes /'));
        const currentVotes = votesField ? votesField.value : '';

        const userId = interaction.user.id;
        const alreadyVoted = currentVotes.includes(`<@${userId}>`);

        if (alreadyVoted) {
            return await interaction.editReply({
                embeds: [createEmbed({
                    title: 'Already Voted / Ya Votaste',
                    description: 'You have already voted on this suggestion.\nYa votaste en esta sugerencia.',
                    color: 'warning'
                })]
            });
        }

        logger.info(`Staff suggestion vote: ${voteType} by ${userId} on message ${message.id}`);

        return await interaction.editReply({
            embeds: [createEmbed({
                title: `${label.emoji} Vote Recorded / Voto Registrado`,
                description: `You voted **${label.name}** on this suggestion.\nVotaste **${label.name}** en esta sugerencia.`,
                color: label.color
            })]
        });
    } catch (error) {
        logger.error('Error handling staff suggestion vote:', error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: 'An error occurred.', flags: MessageFlags.Ephemeral }).catch(() => null);
        }
    }
}

export default VOTE_IDS.map(id => ({
    name: id,
    execute: handleVote
}));

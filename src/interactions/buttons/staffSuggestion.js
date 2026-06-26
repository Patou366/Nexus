import { MessageFlags, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';

const VOTE_IDS = ['staff_suggestion_upvote', 'staff_suggestion_downvote', 'staff_suggestion_neutral'];

const VOTE_KEY = {
    staff_suggestion_upvote:   'u',
    staff_suggestion_downvote: 'd',
    staff_suggestion_neutral:  'n'
};

const LABELS = {
    staff_suggestion_upvote:   { emoji: '👍', name: 'Support / Apoyar',  color: 'success' },
    staff_suggestion_downvote: { emoji: '👎', name: 'Oppose / Oponerse', color: 'error'   },
    staff_suggestion_neutral:  { emoji: '🤔', name: 'Neutral',           color: 'gray'    }
};

const VOTE_FIELD_NAMES = {
    u: '👍 Support / Apoyar',
    d: '👎 Oppose / Oponerse',
    n: '🤔 Neutral'
};

const TRACKING_FIELD_NAME = '\u200b';

// Max total voters before the tracking field value risks hitting Discord's 1024-char limit
// (Discord user IDs are 17-19 digits; 50 voters × 20 chars + format overhead ≈ 1010 chars)
const MAX_TOTAL_VOTERS = 50;

// Parse "u:id1,id2|d:id3|n:id4,id5" → { u: [...], d: [...], n: [...] }
function parseVoterData(value) {
    const result = { u: [], d: [], n: [] };
    if (!value || value === '\u200b' || value === 'u:|d:|n:') return result;
    for (const segment of value.split('|')) {
        const colonIdx = segment.indexOf(':');
        if (colonIdx === -1) continue;
        const key = segment.slice(0, colonIdx);
        const ids = segment.slice(colonIdx + 1);
        if (result[key] !== undefined) {
            result[key] = ids.split(',').filter(Boolean);
        }
    }
    return result;
}

function encodeVoterData(voters) {
    return `u:${voters.u.join(',')}|d:${voters.d.join(',')}|n:${voters.n.join(',')}`;
}

async function handleVote(interaction) {
    try {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const voteType = interaction.customId;
        const label = LABELS[voteType];
        const voteKey = VOTE_KEY[voteType];
        const message = interaction.message;
        const embed = message.embeds[0];

        if (!embed) {
            return await interaction.editReply({
                embeds: [createEmbed({ title: 'Error', description: 'Could not find the suggestion embed.', color: 'error' })]
            });
        }

        const fields = embed.fields || [];

        // Find the hidden voter tracking field
        const trackingField = fields.find(f => f.name === TRACKING_FIELD_NAME);

        // If the tracking field is missing this is a legacy embed that pre-dates vote tracking.
        // Refuse voting rather than silently resetting historical counts.
        if (!trackingField) {
            return await interaction.editReply({
                embeds: [createEmbed({
                    title: 'Voting Unavailable / Votación No Disponible',
                    description: 'This suggestion was posted before vote tracking was enabled. Only new suggestions support live vote counts.\n\nEsta sugerencia fue publicada antes de que se habilitara el seguimiento de votos. Solo las sugerencias nuevas soportan conteo de votos en vivo.',
                    color: 'warning'
                })]
            });
        }

        const voters = parseVoterData(trackingField.value);
        const allVoters = [...voters.u, ...voters.d, ...voters.n];

        // Prevent double voting
        if (allVoters.includes(interaction.user.id)) {
            return await interaction.editReply({
                embeds: [createEmbed({
                    title: 'Already Voted / Ya Votaste',
                    description: 'You have already voted on this suggestion.\nYa votaste en esta sugerencia.',
                    color: 'warning'
                })]
            });
        }

        // Enforce cap to stay safely under Discord's 1024-char embed field value limit
        if (allVoters.length >= MAX_TOTAL_VOTERS) {
            return await interaction.editReply({
                embeds: [createEmbed({
                    title: 'Vote Limit Reached / Límite de Votos Alcanzado',
                    description: `This suggestion has reached the maximum of **${MAX_TOTAL_VOTERS}** votes.\n\nEsta sugerencia ha alcanzado el máximo de **${MAX_TOTAL_VOTERS}** votos.`,
                    color: 'warning'
                })]
            });
        }

        // Record the vote
        voters[voteKey].push(interaction.user.id);

        // Rebuild fields: preserve all non-vote fields, then append updated vote fields + tracking
        const baseFields = fields.filter(f =>
            f.name !== TRACKING_FIELD_NAME &&
            f.name !== VOTE_FIELD_NAMES.u &&
            f.name !== VOTE_FIELD_NAMES.d &&
            f.name !== VOTE_FIELD_NAMES.n
        );

        const updatedFields = [
            ...baseFields,
            { name: VOTE_FIELD_NAMES.u, value: `**${voters.u.length}** votes`, inline: true },
            { name: VOTE_FIELD_NAMES.d, value: `**${voters.d.length}** votes`, inline: true },
            { name: VOTE_FIELD_NAMES.n, value: `**${voters.n.length}** votes`, inline: true },
            { name: TRACKING_FIELD_NAME, value: encodeVoterData(voters), inline: false }
        ];

        // Rebuild embed preserving all existing properties
        const updatedEmbed = EmbedBuilder.from(embed).setFields(updatedFields);

        // Rebuild buttons with updated counts
        const updatedRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('staff_suggestion_upvote')
                .setLabel(`👍 Support / Apoyar (${voters.u.length})`)
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId('staff_suggestion_downvote')
                .setLabel(`👎 Oppose / Oponerse (${voters.d.length})`)
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId('staff_suggestion_neutral')
                .setLabel(`🤔 Neutral (${voters.n.length})`)
                .setStyle(ButtonStyle.Secondary)
        );

        // Edit the original suggestion message to reflect the new vote
        try {
            await message.edit({ embeds: [updatedEmbed], components: [updatedRow] });
        } catch (editError) {
            logger.error(`Failed to edit suggestion message ${message.id}:`, editError);
            return await interaction.editReply({
                embeds: [createEmbed({
                    title: 'Error',
                    description: 'Your vote could not be saved — the suggestion message could not be updated. Please try again.\n\nTu voto no pudo guardarse. Por favor intenta de nuevo.',
                    color: 'error'
                })]
            });
        }

        logger.info(`Staff suggestion vote: ${voteType} by ${interaction.user.id} on message ${message.id}`);

        return await interaction.editReply({
            embeds: [createEmbed({
                title: `${label.emoji} Vote Recorded / Voto Registrado`,
                description: `You voted **${label.name}** on this suggestion.\nVotaste **${label.name}** en esta sugerencia.`,
                color: label.color
            })]
        });

    } catch (error) {
        logger.error('Error handling staff suggestion vote:', error);
        // Always send a reply when deferred — avoids a blank "interaction failed" from Discord
        await interaction.editReply({
            embeds: [createEmbed({
                title: 'Error',
                description: 'Something went wrong processing your vote. Please try again.\n\nAlgo salió mal al procesar tu voto. Por favor intenta de nuevo.',
                color: 'error'
            })]
        }).catch(() => null);
    }
}

export default VOTE_IDS.map(id => ({
    name: id,
    execute: handleVote
}));

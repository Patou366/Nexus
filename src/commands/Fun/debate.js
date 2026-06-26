import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    MessageFlags
} from 'discord.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { activeDebates } from '../../services/debateService.js';

/** Build the live debate embed with current vote counts. */
export function buildDebateEmbed(topic, forCount, againstCount, minutesLeft = null, ended = false) {
    const total = forCount + againstCount;
    const forPct   = total > 0 ? Math.round((forCount   / total) * 100) : 50;
    const agPct    = total > 0 ? Math.round((againstCount / total) * 100) : 50;

    const forBar     = '█'.repeat(Math.round(forPct   / 10)) + '░'.repeat(10 - Math.round(forPct   / 10));
    const againstBar = '█'.repeat(Math.round(agPct    / 10)) + '░'.repeat(10 - Math.round(agPct    / 10));

    let desc = `**${topic}**\n\n`;
    desc += `👍 **For / A favor**\n\`${forBar}\` ${forPct}% (${forCount} vote${forCount !== 1 ? 's' : ''})\n\n`;
    desc += `👎 **Against / En contra**\n\`${againstBar}\` ${agPct}% (${againstCount} vote${againstCount !== 1 ? 's' : ''})`;

    if (ended) {
        let verdict;
        if (forCount > againstCount)      verdict = '👍 **For** wins! / ¡A favor gana!';
        else if (againstCount > forCount) verdict = '👎 **Against** wins! / ¡En contra gana!';
        else                              verdict = "🤝 It's a tie! / ¡Empate!";
        desc += `\n\n${verdict}`;
    }

    return new EmbedBuilder()
        .setTitle(ended ? '⚔️ Debate — Closed / Cerrado' : '⚔️ Debate')
        .setDescription(desc)
        .setColor(ended ? '#95a5a6' : '#f39c12')
        .setFooter({ text: ended ? 'Debate has ended.' : `⏱ Debate closes in ${minutesLeft} min${minutesLeft !== 1 ? 's' : ''} • Vote below!` })
        .setTimestamp();
}

/** Build the vote buttons with live counts. */
export function buildDebateRow(messageId, forCount, againstCount, disabled = false) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`debate_vote:${messageId}:for`)
            .setLabel(`👍 For (${forCount})`)
            .setStyle(ButtonStyle.Success)
            .setDisabled(disabled),
        new ButtonBuilder()
            .setCustomId(`debate_vote:${messageId}:against`)
            .setLabel(`👎 Against (${againstCount})`)
            .setStyle(ButtonStyle.Danger)
            .setDisabled(disabled)
    );
}

/** Called by setTimeout when the debate timer expires. */
async function endDebate(client, messageId) {
    const state = activeDebates.get(messageId);
    if (!state) return;
    activeDebates.delete(messageId);

    try {
        const channel = await client.channels.fetch(state.channelId).catch(() => null);
        if (!channel) return;
        const msg = await channel.messages.fetch(messageId).catch(() => null);
        if (!msg) return;

        const forCount     = state.forVoters.size;
        const againstCount = state.againstVoters.size;

        await msg.edit({
            embeds: [buildDebateEmbed(state.topic, forCount, againstCount, null, true)],
            components: [buildDebateRow(messageId, forCount, againstCount, true)]
        }).catch(err => logger.warn(`Failed to edit debate message ${messageId}:`, err.message));
    } catch (err) {
        logger.error(`Error ending debate ${messageId}:`, err);
    }
}

export default {
    data: new SlashCommandBuilder()
        .setName('debate')
        .setDescription('Start a timed For vs. Against community debate')
        .setDMPermission(false)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addStringOption(opt =>
            opt.setName('topic')
                .setDescription('The debate topic or statement')
                .setRequired(true)
                .setMaxLength(256)
        )
        .addIntegerOption(opt =>
            opt.setName('time')
                .setDescription('Minutes before the debate closes (1–60)')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(60)
        ),

    category: 'Fun',

    async execute(interaction, config, client) {
        // Hoisted outside try so catch can always clean up orphaned timers
        let msg       = null;
        let timeoutId = null;

        try {
            await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

            const topic   = interaction.options.getString('topic');
            const minutes = interaction.options.getInteger('time');

            msg = await interaction.channel.send({
                embeds: [buildDebateEmbed(topic, 0, 0, minutes, false)],
                components: [buildDebateRow('PLACEHOLDER', 0, 0)]
            });

            // Patch button IDs with real messageId
            await msg.edit({
                components: [buildDebateRow(msg.id, 0, 0)]
            });

            // Store endsAt so button handler can compute remaining time for the footer
            const endsAt = Date.now() + minutes * 60 * 1000;

            // Register active debate and arm timer
            timeoutId = setTimeout(() => endDebate(client, msg.id), minutes * 60 * 1000);
            activeDebates.set(msg.id, {
                topic,
                forVoters:     new Set(),
                againstVoters: new Set(),
                guildId:       interaction.guildId,
                channelId:     interaction.channelId,
                messageId:     msg.id,
                endsAt,
                timeoutId
            });

            await InteractionHelper.safeEditReply(interaction, {
                content: `✅ Debate posted! It will close in **${minutes} minute${minutes !== 1 ? 's' : ''}**.`
            });

            logger.info(`Debate posted by ${interaction.user.tag} in guild ${interaction.guildId}, msg ${msg.id}`);
        } catch (error) {
            logger.error('Debate command error:', error);
            // Clean up orphaned state if the timer was already scheduled
            if (timeoutId !== null) {
                clearTimeout(timeoutId);
                if (msg?.id) activeDebates.delete(msg.id);
            }
            await handleInteractionError(interaction, error, { commandName: 'debate' });
        }
    }
};

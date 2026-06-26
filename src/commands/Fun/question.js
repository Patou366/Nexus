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
import { activeQuestions } from '../../services/questionService.js';

const OPTION_LABELS = ['A', 'B', 'C'];

/** Shuffle array in-place (Fisher-Yates) and return it. */
function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

/** Build the live question embed. */
function buildQuestionEmbed(question, options, timeSeconds) {
    const optionLines = options.map((opt, i) => `**${OPTION_LABELS[i]})** ${opt}`).join('\n');
    return new EmbedBuilder()
        .setTitle('❓ Question / Pregunta')
        .setDescription(`**${question}**\n\n${optionLines}`)
        .setColor('#3498db')
        .setFooter({ text: `⏱ ${timeSeconds}s to answer • Tap A, B, or C below` })
        .setTimestamp();
}

/** Build the result embed shown when the question closes. */
function buildResultEmbed(state) {
    const correctLabel = OPTION_LABELS[state.correctIndex];
    const correctOption = state.options[state.correctIndex];
    const correct = [...state.correctUsers];
    const wrongCount = state.answeredUsers.size - correct.length;

    let resultText = `✅ **Correct answer: ${correctLabel}) ${correctOption}**\n\n`;

    if (correct.length === 0) {
        resultText += '😔 Nobody got it right! / ¡Nadie acertó!';
    } else if (correct.length <= 15) {
        resultText += `🏆 **Got it right (${correct.length}):** ${correct.map(id => `<@${id}>`).join(', ')}`;
    } else {
        resultText += `🏆 **${correct.length} players answered correctly!**`;
    }

    if (wrongCount > 0) {
        resultText += `\n❌ ${wrongCount} player${wrongCount !== 1 ? 's' : ''} answered wrong.`;
    }

    if (state.answeredUsers.size === 0) {
        resultText += '\n\n*Nobody answered in time. / Nadie respondió a tiempo.*';
    }

    return new EmbedBuilder()
        .setTitle('❓ Question — Time\'s Up! / ¡Tiempo!')
        .setDescription(`**${state.question}**\n\n${resultText}`)
        .setColor('#e74c3c')
        .setTimestamp();
}

/** Build a disabled button row revealing which was correct. */
function buildDisabledRow(state) {
    const row = new ActionRowBuilder();
    for (let i = 0; i < 3; i++) {
        const isCorrect = i === state.correctIndex;
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(`q_answer:${state.messageId}:${i}`)
                .setLabel(`${OPTION_LABELS[i]}) ${state.options[i]}`.slice(0, 80))
                .setStyle(isCorrect ? ButtonStyle.Success : ButtonStyle.Danger)
                .setDisabled(true)
        );
    }
    return row;
}

/** Called by setTimeout when the question expires. */
async function endQuestion(client, messageId) {
    const state = activeQuestions.get(messageId);
    if (!state) return;
    activeQuestions.delete(messageId);

    try {
        const channel = await client.channels.fetch(state.channelId).catch(() => null);
        if (!channel) return;
        const msg = await channel.messages.fetch(messageId).catch(() => null);
        if (!msg) return;

        await msg.edit({
            embeds: [buildResultEmbed(state)],
            components: [buildDisabledRow(state)]
        }).catch(err => logger.warn(`Failed to edit question message ${messageId}:`, err.message));
    } catch (err) {
        logger.error(`Error ending question ${messageId}:`, err);
    }
}

export default {
    data: new SlashCommandBuilder()
        .setName('question')
        .setDescription('Post a timed multiple-choice question — first correct answers win points')
        .setDMPermission(false)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addStringOption(opt =>
            opt.setName('question')
                .setDescription('The question to ask')
                .setRequired(true)
                .setMaxLength(256)
        )
        .addStringOption(opt =>
            opt.setName('correct')
                .setDescription('The correct answer')
                .setRequired(true)
                .setMaxLength(80)
        )
        .addStringOption(opt =>
            opt.setName('wrong1')
                .setDescription('First wrong answer')
                .setRequired(true)
                .setMaxLength(80)
        )
        .addStringOption(opt =>
            opt.setName('wrong2')
                .setDescription('Second wrong answer')
                .setRequired(true)
                .setMaxLength(80)
        )
        .addIntegerOption(opt =>
            opt.setName('time')
                .setDescription('Seconds before the question closes (10–300)')
                .setRequired(true)
                .setMinValue(10)
                .setMaxValue(300)
        ),

    category: 'Fun',

    async execute(interaction, config, client) {
        // Hoisted outside try so catch can always clean up orphaned timers
        let msg       = null;
        let timeoutId = null;

        try {
            await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

            const questionText = interaction.options.getString('question');
            const correct      = interaction.options.getString('correct');
            const wrong1       = interaction.options.getString('wrong1');
            const wrong2       = interaction.options.getString('wrong2');
            const timeSeconds  = interaction.options.getInteger('time');

            // Shuffle and remember which index is correct
            const shuffled = shuffle([correct, wrong1, wrong2]);
            const correctIndex = shuffled.indexOf(correct);

            // Build live embed + buttons
            const embed = buildQuestionEmbed(questionText, shuffled, timeSeconds);
            const row = new ActionRowBuilder();
            for (let i = 0; i < 3; i++) {
                row.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`q_answer:PLACEHOLDER:${i}`)
                        .setLabel(`${OPTION_LABELS[i]}) ${shuffled[i]}`.slice(0, 80))
                        .setStyle(ButtonStyle.Primary)
                );
            }

            msg = await interaction.channel.send({ embeds: [embed], components: [row] });

            // Patch button custom IDs now that we have the messageId
            const finalRow = new ActionRowBuilder();
            for (let i = 0; i < 3; i++) {
                finalRow.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`q_answer:${msg.id}:${i}`)
                        .setLabel(`${OPTION_LABELS[i]}) ${shuffled[i]}`.slice(0, 80))
                        .setStyle(ButtonStyle.Primary)
                );
            }
            await msg.edit({ components: [finalRow] });

            // Register active question and arm timer
            timeoutId = setTimeout(() => endQuestion(client, msg.id), timeSeconds * 1000);
            activeQuestions.set(msg.id, {
                question: questionText,
                options: shuffled,
                correctIndex,
                answeredUsers: new Set(),
                correctUsers: new Set(),
                guildId: interaction.guildId,
                channelId: interaction.channelId,
                messageId: msg.id,
                timeoutId
            });

            await InteractionHelper.safeEditReply(interaction, {
                content: `✅ Question posted! It will close in **${timeSeconds}s**.`
            });

            logger.info(`Question posted by ${interaction.user.tag} in guild ${interaction.guildId}, msg ${msg.id}`);
        } catch (error) {
            logger.error('Question command error:', error);
            // Clean up orphaned state if the timer was already scheduled
            if (typeof timeoutId !== 'undefined' && timeoutId !== null) {
                clearTimeout(timeoutId);
                if (msg?.id) activeQuestions.delete(msg.id);
            }
            await handleInteractionError(interaction, error, { commandName: 'question' });
        }
    }
};

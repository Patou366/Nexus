import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { TitanBotError, ErrorTypes, handleInteractionError } from '../../utils/errorHandler.js';
import { saveGiveaway } from '../../utils/giveaways.js';
import {
    parseDuration,
    validatePrize,
    validateWinnerCount,
    createGiveawayEmbed,
    createGiveawayButtons,
} from '../../services/giveawayService.js';
import { logEvent, EVENT_TYPES } from '../../services/loggingService.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { guardGuild, guardPermission } from '../../utils/commandGuards.js';
import { safeLogEvent } from '../../utils/safeLogger.js';

export default {
    data: new SlashCommandBuilder()
        .setName('gcreate')
        .setDescription('Starts a new giveaway in a specified channel.')
        // ── Required ──────────────────────────────────────────────────────────
        .addStringOption(opt =>
            opt.setName('duration')
                .setDescription('How long the giveaway lasts (e.g. 1h, 30m, 5d).')
                .setRequired(true))
        .addIntegerOption(opt =>
            opt.setName('winners')
                .setDescription('Number of winners to pick (1-20).')
                .setMinValue(1)
                .setMaxValue(20)
                .setRequired(true))
        .addStringOption(opt =>
            opt.setName('prize')
                .setDescription('What is being given away.')
                .setRequired(true))
        // ── Optional ──────────────────────────────────────────────────────────
        .addChannelOption(opt =>
            opt.setName('channel')
                .setDescription('Channel to post the giveaway in (defaults to current).')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(false))
        .addStringOption(opt =>
            opt.setName('description')
                .setDescription('Extra description shown on the giveaway embed.')
                .setMaxLength(512)
                .setRequired(false))
        .addStringOption(opt =>
            opt.setName('image')
                .setDescription('Image URL displayed as a banner on the giveaway embed.')
                .setRequired(false))
        .addRoleOption(opt =>
            opt.setName('required_role')
                .setDescription('Role members must have to enter the giveaway.')
                .setRequired(false))
        .addRoleOption(opt =>
            opt.setName('bonus_role')
                .setDescription('Role that earns extra entries (use with bonus_entries).')
                .setRequired(false))
        .addIntegerOption(opt =>
            opt.setName('bonus_entries')
                .setDescription('How many tickets the bonus role receives (default: 2).')
                .setMinValue(2)
                .setMaxValue(10)
                .setRequired(false))
        .addIntegerOption(opt =>
            opt.setName('max_entries')
                .setDescription('Cap on the number of unique entrants (0 = unlimited).')
                .setMinValue(0)
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
        try {
            guardGuild(interaction);
            guardPermission(interaction, PermissionFlagsBits.ManageGuild, 'Manage Server');

            const durationString    = interaction.options.getString('duration');
            const winnerCount       = interaction.options.getInteger('winners');
            const prize             = interaction.options.getString('prize');
            const targetChannel     = interaction.options.getChannel('channel') || interaction.channel;
            const description       = interaction.options.getString('description') ?? null;
            const imageUrl          = interaction.options.getString('image') ?? null;
            const requiredRole      = interaction.options.getRole('required_role') ?? null;
            const bonusRole         = interaction.options.getRole('bonus_role') ?? null;
            const bonusEntries      = interaction.options.getInteger('bonus_entries') ?? 2;
            const maxEntriesRaw     = interaction.options.getInteger('max_entries') ?? 0;
            const maxEntries        = maxEntriesRaw > 0 ? maxEntriesRaw : null;

            // Validate
            const durationMs = parseDuration(durationString);
            validateWinnerCount(winnerCount);
            const prizeName = validatePrize(prize);

            if (!targetChannel.isTextBased()) {
                throw new TitanBotError(
                    'Target channel is not text-based',
                    ErrorTypes.VALIDATION,
                    'The channel must be a text channel.',
                    { channelId: targetChannel.id }
                );
            }

            // Validate image URL if provided
            if (imageUrl) {
                try {
                    const u = new URL(imageUrl);
                    if (!['http:', 'https:'].includes(u.protocol)) throw new Error('bad protocol');
                } catch {
                    throw new TitanBotError(
                        'Invalid image URL',
                        ErrorTypes.VALIDATION,
                        'The image URL must be a valid https:// link.',
                    );
                }
            }

            const endTime = Date.now() + durationMs;

            const giveawayData = {
                messageId:       'placeholder',
                channelId:       targetChannel.id,
                guildId:         interaction.guildId,
                prize:           prizeName,
                description:     description,
                imageUrl:        imageUrl,
                hostId:          interaction.user.id,
                endTime:         endTime,
                endsAt:          endTime,
                winnerCount,
                participants:    [],
                requiredRoleId:  requiredRole?.id ?? null,
                bonusRoleId:     bonusRole?.id ?? null,
                bonusEntries:    bonusRole ? bonusEntries : null,
                maxEntries:      maxEntries,
                isEnded:         false,
                ended:           false,
                createdAt:       new Date().toISOString(),
            };

            const embed = createGiveawayEmbed(giveawayData, 'active');
            const row   = createGiveawayButtons(false);

            const giveawayMessage = await targetChannel.send({
                content: '🎉 **NEW GIVEAWAY** 🎉',
                embeds: [embed],
                components: [row],
            });

            giveawayData.messageId = giveawayMessage.id;

            const saved = await saveGiveaway(interaction.client, interaction.guildId, giveawayData);
            if (!saved) logger.warn(`Failed to persist giveaway ${giveawayMessage.id} to database`);

            await safeLogEvent(() => logEvent({
                client: interaction.client,
                guildId: interaction.guildId,
                eventType: EVENT_TYPES.GIVEAWAY_CREATE,
                data: {
                    description: `Giveaway created: ${prizeName}`,
                    channelId: targetChannel.id,
                    userId: interaction.user.id,
                    fields: [
                        { name: '🎁 Prize',    value: prizeName,                 inline: true },
                        { name: '🏆 Winners',  value: winnerCount.toString(),    inline: true },
                        { name: '⏰ Duration', value: durationString,            inline: true },
                        { name: '📍 Channel',  value: targetChannel.toString(),  inline: true },
                        ...(requiredRole ? [{ name: '🔒 Required Role', value: requiredRole.toString(), inline: true }] : []),
                        ...(bonusRole    ? [{ name: '⭐ Bonus Role',    value: `${bonusRole} (${bonusEntries}x)`,    inline: true }] : []),
                    ],
                },
            }), 'giveaway creation');

            logger.info(`Giveaway created: ${giveawayMessage.id} by ${interaction.user.tag} in ${targetChannel.name}`);

            // Build summary for reply
            const lines = [
                `A new giveaway for **${prizeName}** has started in ${targetChannel}!`,
                `It ends **${durationString}** from now.`,
            ];
            if (requiredRole) lines.push(`Required role: ${requiredRole}`);
            if (bonusRole)    lines.push(`Bonus entries (${bonusEntries}x): ${bonusRole}`);
            if (maxEntries)   lines.push(`Entry cap: ${maxEntries} entrants`);

            await InteractionHelper.safeReply(interaction, {
                embeds: [successEmbed('Giveaway Started! 🎉', lines.join('\n'))],
                flags: MessageFlags.Ephemeral,
            });

        } catch (error) {
            await handleInteractionError(interaction, error, {
                type: 'command',
                commandName: 'gcreate',
                context: 'giveaway_creation',
            });
        }
    },
};

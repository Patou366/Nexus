import { MessageFlags, PermissionFlagsBits } from 'discord.js';
import { errorEmbed, successEmbed } from '../utils/embeds.js';
import { logger } from '../utils/logger.js';
import { TitanBotError, ErrorTypes, handleInteractionError } from '../utils/errorHandler.js';
import {
    getGuildGiveaways,
    saveGiveaway,
    isGiveawayEnded,
} from '../utils/giveaways.js';
import { Mutex } from '../utils/mutex.js';
import {
    selectWinners,
    isUserRateLimited,
    recordUserInteraction,
    createGiveawayEmbed,
    createGiveawayButtons,
    checkEntryEligibility,
} from '../services/giveawayService.js';
import { logEvent, EVENT_TYPES } from '../services/loggingService.js';


export const giveawayJoinHandler = {
    customId: 'giveaway_join',
    async execute(interaction, client) {
        try {
            if (isUserRateLimited(interaction.user.id, interaction.message.id)) {
                return interaction.reply({
                    embeds: [errorEmbed('Rate Limited', 'Please wait a moment before interacting again.')],
                    flags: MessageFlags.Ephemeral,
                });
            }

            recordUserInteraction(interaction.user.id, interaction.message.id);

            // Acknowledge the interaction IMMEDIATELY, before acquiring the mutex
            // or doing any DB work. The join handler serializes clicks on the same
            // giveaway via the mutex and performs several sequential network calls
            // (DB read, DB write, message edit) before replying. Under load, queued
            // clicks would otherwise blow past Discord's 3s acknowledgement window
            // and surface as "This interaction failed". Deferring here reserves the
            // 15-minute response window up front. (interaction.reply is patched to
            // route to editReply once deferred, so the calls below still work.)
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            }

            const lockKey = `giveaway:${interaction.message.id}`;
            await Mutex.runExclusive(lockKey, async () => {
                const guildGiveaways = await getGuildGiveaways(client, interaction.guildId);
                const giveaway = guildGiveaways.find(g => g.messageId === interaction.message.id);

                if (!giveaway) {
                    throw new TitanBotError(
                        'Giveaway not found in database',
                        ErrorTypes.VALIDATION,
                        'This giveaway is no longer active.',
                        { messageId: interaction.message.id, guildId: interaction.guildId }
                    );
                }

                if (isGiveawayEnded(giveaway) || giveaway.ended || giveaway.isEnded) {
                    return interaction.reply({
                        embeds: [errorEmbed('Giveaway Ended', 'This giveaway has already ended.')],
                        flags: MessageFlags.Ephemeral,
                    });
                }

                // Fetch member for role checks
                const member = interaction.member
                    ?? await interaction.guild.members.fetch(interaction.user.id).catch(() => null);

                if (!member) {
                    return interaction.reply({
                        embeds: [errorEmbed('Error', 'Could not verify your server membership. Please try again.')],
                        flags: MessageFlags.Ephemeral,
                    });
                }

                // Role-requirement & cap check
                const eligibility = await checkEntryEligibility(member, giveaway);
                if (!eligibility.eligible) {
                    return interaction.reply({
                        embeds: [errorEmbed('Cannot Enter', eligibility.reason)],
                        flags: MessageFlags.Ephemeral,
                    });
                }

                // Determine ticket count (bonus role support)
                const hasBonusRole = giveaway.bonusRoleId && member.roles.cache.has(giveaway.bonusRoleId);
                const ticketCount = hasBonusRole ? Math.max(1, giveaway.bonusEntries ?? 2) : 1;

                const participants = giveaway.participants || [];
                for (let i = 0; i < ticketCount; i++) {
                    participants.push(interaction.user.id);
                }
                giveaway.participants = participants;

                await saveGiveaway(client, interaction.guildId, giveaway);

                logger.debug(`${interaction.user.tag} entered giveaway ${interaction.message.id} (${ticketCount} ticket(s))`);

                const updatedEmbed = createGiveawayEmbed(giveaway, 'active');
                await interaction.message.edit({
                    embeds: [updatedEmbed],
                    components: [createGiveawayButtons(false)],
                });

                const uniqueEntrants = new Set(participants).size;
                const bonusLine = hasBonusRole
                    ? `\n⭐ Bonus role detected — you have **${ticketCount} tickets** for higher odds!`
                    : '';

                await interaction.reply({
                    embeds: [successEmbed(
                        '🎉 You\'re in!',
                        `Good luck, ${interaction.user}! There are now **${uniqueEntrants}** unique entrant(s).${bonusLine}`,
                    )],
                    flags: MessageFlags.Ephemeral,
                });
            });
        } catch (error) {
            logger.error('Error in giveaway join handler:', error);
            await handleInteractionError(interaction, error, { type: 'button', customId: 'giveaway_join', handler: 'giveaway' });
        }
    },
};




export const giveawayEndHandler = {
    customId: 'giveaway_end',
    async execute(interaction, client) {
        try {
            
            if (!interaction.inGuild()) {
                throw new TitanBotError(
                    'Button used outside guild',
                    ErrorTypes.VALIDATION,
                    'This button can only be used in a server.',
                    { userId: interaction.user.id }
                );
            }

            
            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                return interaction.reply({
                    embeds: [errorEmbed('Permission Denied', "You need the 'Manage Server' permission to end a giveaway.")],
                    flags: MessageFlags.Ephemeral
                });
            }

            const guildGiveaways = await getGuildGiveaways(client, interaction.guildId);
            const giveaway = guildGiveaways.find(g => g.messageId === interaction.message.id);

            if (!giveaway) {
                throw new TitanBotError(
                    'Giveaway not found in database',
                    ErrorTypes.VALIDATION,
                    'This giveaway is no longer active.',
                    { messageId: interaction.message.id, guildId: interaction.guildId }
                );
            }

            if (giveaway.ended || giveaway.isEnded || isGiveawayEnded(giveaway)) {
                throw new TitanBotError(
                    'Giveaway already ended',
                    ErrorTypes.VALIDATION,
                    'This giveaway has already ended.',
                    { messageId: interaction.message.id }
                );
            }

            const participants = giveaway.participants || [];
            const winners = selectWinners(participants, giveaway.winnerCount);

            
            giveaway.ended = true;
            giveaway.isEnded = true;
            giveaway.winnerIds = winners;
            giveaway.endedAt = new Date().toISOString();
            giveaway.endedBy = interaction.user.id;

            await saveGiveaway(client, interaction.guildId, giveaway);

            logger.info(`Giveaway ended via button by ${interaction.user.tag}: ${interaction.message.id}`);

            
            const updatedEmbed = createGiveawayEmbed(giveaway, 'ended', winners);
            const updatedRow = createGiveawayButtons(true);

            await interaction.message.edit({
                content: '🎉 **GIVEAWAY ENDED** 🎉',
                embeds: [updatedEmbed],
                components: [updatedRow]
            });

            
            try {
                await logEvent({
                    client,
                    guildId: interaction.guildId,
                    eventType: EVENT_TYPES.GIVEAWAY_WINNER,
                    data: {
                        description: `Giveaway ended with ${winners.length} winner(s)`,
                        channelId: interaction.channelId,
                        userId: interaction.user.id,
                        fields: [
                            {
                                name: '🎁 Prize',
                                value: giveaway.prize || 'Mystery Prize!',
                                inline: true
                            },
                            {
                                name: '🏆 Winners',
                                value: winners.length > 0 
                                    ? winners.map(id => `<@${id}>`).join(', ')
                                    : 'No valid entries',
                                inline: false
                            },
                            {
                                name: '👥 Total Entries',
                                value: participants.length.toString(),
                                inline: true
                            }
                        ]
                    }
                });
            } catch (logError) {
                logger.debug('Error logging giveaway end event:', logError);
            }

            await interaction.reply({
                embeds: [
                    successEmbed(
                        `Giveaway Ended ✅`,
                        `The giveaway has been ended and ${winners.length} winner(s) have been selected!`
                    )
                ],
                flags: MessageFlags.Ephemeral
            });

        } catch (error) {
            logger.error('Error in giveaway end handler:', error);
            await handleInteractionError(interaction, error, {
                type: 'button',
                customId: 'giveaway_end',
                handler: 'giveaway'
            });
        }
    }
};




export const giveawayRerollHandler = {
    customId: 'giveaway_reroll',
    async execute(interaction, client) {
        try {
            
            if (!interaction.inGuild()) {
                throw new TitanBotError(
                    'Button used outside guild',
                    ErrorTypes.VALIDATION,
                    'This button can only be used in a server.',
                    { userId: interaction.user.id }
                );
            }

            
            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                return interaction.reply({
                    embeds: [errorEmbed('Permission Denied', "You need the 'Manage Server' permission to reroll a giveaway.")],
                    flags: MessageFlags.Ephemeral
                });
            }

            const guildGiveaways = await getGuildGiveaways(client, interaction.guildId);
            const giveaway = guildGiveaways.find(g => g.messageId === interaction.message.id);

            if (!giveaway) {
                throw new TitanBotError(
                    'Giveaway not found in database',
                    ErrorTypes.VALIDATION,
                    'This giveaway is no longer active.',
                    { messageId: interaction.message.id, guildId: interaction.guildId }
                );
            }

            if (!giveaway.ended && !giveaway.isEnded) {
                throw new TitanBotError(
                    'Giveaway still active',
                    ErrorTypes.VALIDATION,
                    'This giveaway has not ended yet. Please end it first.',
                    { messageId: interaction.message.id }
                );
            }

            const participants = giveaway.participants || [];
            
            if (participants.length === 0) {
                throw new TitanBotError(
                    'No participants to reroll',
                    ErrorTypes.VALIDATION,
                    'There are no entries to reroll from.',
                    { messageId: interaction.message.id }
                );
            }

            const newWinners = selectWinners(participants, giveaway.winnerCount);

            
            giveaway.winnerIds = newWinners;
            giveaway.rerolledAt = new Date().toISOString();
            giveaway.rerolledBy = interaction.user.id;

            await saveGiveaway(client, interaction.guildId, giveaway);

            logger.info(`Giveaway rerolled via button by ${interaction.user.tag}: ${interaction.message.id}`);

            
            const updatedEmbed = createGiveawayEmbed(giveaway, 'reroll', newWinners);
            const updatedRow = createGiveawayButtons(true);

            await interaction.message.edit({
                content: '🔄 **GIVEAWAY REROLLED** 🔄',
                embeds: [updatedEmbed],
                components: [updatedRow]
            });

            
            try {
                await logEvent({
                    client,
                    guildId: interaction.guildId,
                    eventType: EVENT_TYPES.GIVEAWAY_REROLL,
                    data: {
                        description: `Giveaway rerolled`,
                        channelId: interaction.channelId,
                        userId: interaction.user.id,
                        fields: [
                            {
                                name: '🎁 Prize',
                                value: giveaway.prize || 'Mystery Prize!',
                                inline: true
                            },
                            {
                                name: '🏆 New Winners',
                                value: newWinners.map(id => `<@${id}>`).join(', '),
                                inline: false
                            },
                            {
                                name: '👥 Total Entries',
                                value: participants.length.toString(),
                                inline: true
                            }
                        ]
                    }
                });
            } catch (logError) {
                logger.debug('Error logging giveaway reroll event:', logError);
            }

            await interaction.reply({
                embeds: [
                    successEmbed(
                        'Giveaway Rerolled ✅',
                        `New winner(s) have been selected!`
                    )
                ],
                flags: MessageFlags.Ephemeral
            });

        } catch (error) {
            logger.error('Error in giveaway reroll handler:', error);
            await handleInteractionError(interaction, error, {
                type: 'button',
                customId: 'giveaway_reroll',
                handler: 'giveaway'
            });
        }
    }
};

export const giveawayViewHandler = {
    customId: 'giveaway_view',
    async execute(interaction, client) {
        try {
            if (!interaction.inGuild()) {
                throw new TitanBotError(
                    'Button used outside guild',
                    ErrorTypes.VALIDATION,
                    'This button can only be used in a server.',
                    { userId: interaction.user.id }
                );
            }

            const guildGiveaways = await getGuildGiveaways(client, interaction.guildId);
            const giveaway = guildGiveaways.find(g => g.messageId === interaction.message.id);

            if (!giveaway) {
                throw new TitanBotError(
                    'Giveaway not found in database',
                    ErrorTypes.VALIDATION,
                    'This giveaway could not be found.',
                    { messageId: interaction.message.id, guildId: interaction.guildId }
                );
            }

            if (!giveaway.ended && !giveaway.isEnded && !isGiveawayEnded(giveaway)) {
                return interaction.reply({
                    embeds: [
                        errorEmbed(
                            'Giveaway Still Active',
                            'This giveaway has not ended yet, so winners are not available.'
                        )
                    ],
                    flags: MessageFlags.Ephemeral
                });
            }

            const winnerIds = Array.isArray(giveaway.winnerIds) ? giveaway.winnerIds : [];
            const winnerMentions = winnerIds.length > 0
                ? winnerIds.map(id => `<@${id}>`).join(', ')
                : 'No valid winners were selected for this giveaway.';

            await interaction.reply({
                embeds: [
                    successEmbed(
                        `Winners for ${giveaway.prize || 'this giveaway'} 🎉`,
                        winnerMentions
                    )
                ],
                flags: MessageFlags.Ephemeral
            });
        } catch (error) {
            logger.error('Error in giveaway view handler:', error);
            await handleInteractionError(interaction, error, {
                type: 'button',
                customId: 'giveaway_view',
                handler: 'giveaway'
            });
        }
    }
};




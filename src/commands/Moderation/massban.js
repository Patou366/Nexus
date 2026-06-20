import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { errorEmbed } from '../../utils/embeds.js';
import { logModerationAction } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { guardDefer, guardPermission, guardRateLimit } from '../../utils/commandGuards.js';
import {
    parseUserIds,
    createMassActionResults,
    checkMassActionHierarchy,
    formatMassActionResults,
    getMassActionEmbed
} from '../../utils/massActionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName("massban")
        .setDescription("Ban multiple users from the server at once")
        .addStringOption(option =>
            option
                .setName("users")
                .setDescription("User IDs or mentions to ban (separated by spaces or commas)")
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName("reason")
                .setDescription("Reason for the mass ban")
                .setRequired(false)
        )
        .addIntegerOption(option =>
            option
                .setName("delete_days")
                .setDescription("Number of days of messages to delete (0-7)")
                .setMinValue(0)
                .setMaxValue(7)
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
    category: "moderation",

    async execute(interaction, config, client) {
        if (!await guardDefer(interaction, 'massban')) return;

        try {
            guardPermission(interaction, PermissionFlagsBits.BanMembers, 'Ban Members');

            const usersInput = interaction.options.getString("users");
            const reason = interaction.options.getString("reason") || "Mass ban - No reason provided";
            const deleteDays = interaction.options.getInteger("delete_days") || 0;

            if (!await guardRateLimit(interaction, 'massban', 3, 60000)) return;

            const userIds = parseUserIds(usersInput);

            if (userIds.length === 0) {
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        errorEmbed(
                            "Invalid Users",
                            "Please provide valid user IDs or mentions. Maximum 20 users at once."
                        ),
                    ],
                });
            }

            if (userIds.includes(interaction.user.id)) {
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        errorEmbed("Cannot Ban Self", "You cannot include yourself in a mass ban."),
                    ],
                });
            }

            if (userIds.includes(client.user.id)) {
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        errorEmbed("Cannot Ban Bot", "You cannot include the bot in a mass ban."),
                    ],
                });
            }

            const results = createMassActionResults();

            for (const userId of userIds) {
                try {
                    const user = await client.users.fetch(userId).catch(() => null);

                    if (!user) {
                        results.failed.push({ userId, reason: "User not found" });
                        continue;
                    }

                    const member = await interaction.guild.members.fetch(userId).catch(() => null);

                    if (member) {
                        const hierarchy = checkMassActionHierarchy(member, interaction);
                        if (!hierarchy.allowed) {
                            results.skipped.push({
                                user: user.tag,
                                userId,
                                reason: hierarchy.reason
                            });
                            continue;
                        }
                    }

                    await interaction.guild.members.ban(userId, {
                        reason: reason,
                        deleteMessageDays: deleteDays
                    });

                    results.successful.push({ user: user.tag, userId });

                    await logModerationAction({
                        client,
                        guild: interaction.guild,
                        event: {
                            action: "Member Banned",
                            target: `${user.tag} (${user.id})`,
                            executor: `${interaction.user.tag} (${interaction.user.id})`,
                            reason: `${reason} (Mass Ban)`,
                            metadata: {
                                userId: user.id,
                                moderatorId: interaction.user.id,
                                massBan: true,
                                permanent: true
                            }
                        }
                    });

                } catch (error) {
                    logger.error(`Failed to ban user ${userId}:`, error);
                    results.failed.push({
                        userId,
                        reason: error.message || "Unknown error"
                    });
                }
            }

            const description = formatMassActionResults(results, 'Ban');
            const embed = getMassActionEmbed(results);

            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [embed(`🔨 Mass Ban Completed`, description)]
            });

        } catch (error) {
            logger.error("Error in massban command:", error);
            await handleInteractionError(interaction, error, { subtype: 'massban_failed' });
        }
    }
};

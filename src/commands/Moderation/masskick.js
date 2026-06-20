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
        .setName("masskick")
        .setDescription("Kick multiple users from the server at once")
        .addStringOption(option =>
            option
                .setName("users")
                .setDescription("User IDs or mentions to kick (separated by spaces or commas)")
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName("reason")
                .setDescription("Reason for the mass kick")
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
    category: "moderation",

    async execute(interaction, config, client) {
        if (!await guardDefer(interaction, 'masskick')) return;

        try {
            guardPermission(interaction, PermissionFlagsBits.KickMembers, 'Kick Members');

            const usersInput = interaction.options.getString("users");
            const reason = interaction.options.getString("reason") || "Mass kick - No reason provided";

            if (!await guardRateLimit(interaction, 'masskick', 3, 60000)) return;

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
                        errorEmbed("Cannot Kick Self", "You cannot include yourself in a mass kick."),
                    ],
                });
            }

            if (userIds.includes(client.user.id)) {
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        errorEmbed("Cannot Kick Bot", "You cannot include the bot in a mass kick."),
                    ],
                });
            }

            const results = createMassActionResults();

            for (const userId of userIds) {
                try {
                    const member = await interaction.guild.members.fetch(userId).catch(() => null);

                    if (!member) {
                        results.failed.push({ userId, reason: "User not in server" });
                        continue;
                    }

                    const hierarchy = checkMassActionHierarchy(member, interaction);
                    if (!hierarchy.allowed) {
                        results.skipped.push({
                            user: member.user.tag,
                            userId,
                            reason: hierarchy.reason
                        });
                        continue;
                    }

                    await member.kick(reason);

                    results.successful.push({ user: member.user.tag, userId });

                    await logModerationAction({
                        client,
                        guild: interaction.guild,
                        event: {
                            action: "Member Kicked",
                            target: `${member.user.tag} (${member.user.id})`,
                            executor: `${interaction.user.tag} (${interaction.user.id})`,
                            reason: `${reason} (Mass Kick)`,
                            metadata: {
                                userId: member.user.id,
                                moderatorId: interaction.user.id,
                                massKick: true
                            }
                        }
                    });

                } catch (error) {
                    logger.error(`Failed to kick user ${userId}:`, error);
                    results.failed.push({
                        userId,
                        reason: error.message || "Unknown error"
                    });
                }
            }

            const description = formatMassActionResults(results, 'Kick');
            const embed = getMassActionEmbed(results);

            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [embed(`👢 Mass Kick Completed`, description)]
            });

        } catch (error) {
            logger.error("Error in masskick command:", error);
            await handleInteractionError(interaction, error, { subtype: 'masskick_failed' });
        }
    }
};

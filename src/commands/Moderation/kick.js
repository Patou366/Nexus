import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { logModerationAction } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import {
    guardSelfTarget,
    guardPermission,
    guardMemberExists,
    guardRoleHierarchy
} from '../../utils/commandGuards.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';

export default {
    data: new SlashCommandBuilder()
        .setName("kick")
        .setDescription("Kick a user from the server")
        .addUserOption((option) =>
            option
                .setName("target")
                .setDescription("The user to kick")
                .setRequired(true),
        )
        .addStringOption((option) =>
            option.setName("reason").setDescription("Reason for the kick"),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
    category: "moderation",

    async execute(interaction, config, client) {
        try {
            guardPermission(interaction, PermissionFlagsBits.KickMembers, 'Kick Members');

            const targetUser = interaction.options.getUser("target");
            const member = interaction.options.getMember("target");
            const reason = interaction.options.getString("reason") || "No reason provided";

            guardSelfTarget(targetUser.id, interaction, client, 'kick');
            guardMemberExists(member);
            guardRoleHierarchy(interaction, member, 'kick');

            if (!member.kickable) {
                throw new TitanBotError(
                    "Bot cannot kick",
                    ErrorTypes.PERMISSION,
                    "I cannot kick this user. Please check my role position relative to the target user."
                );
            }

            await member.kick(reason);

            const caseId = await logModerationAction({
                client,
                guild: interaction.guild,
                event: {
                    action: "Member Kicked",
                    target: `${targetUser.tag} (${targetUser.id})`,
                    executor: `${interaction.user.tag} (${interaction.user.id})`,
                    reason,
                    metadata: {
                        userId: targetUser.id,
                        moderatorId: interaction.user.id
                    }
                }
            });

            await InteractionHelper.universalReply(interaction, {
                embeds: [
                    successEmbed(
                        `👢 **Kicked** ${targetUser.tag}`,
                        `**Reason:** ${reason}\n**Case ID:** #${caseId}`,
                    ),
                ],
            });
        } catch (error) {
            logger.error('Kick command error:', error);
            await handleInteractionError(interaction, error, { subtype: 'kick_failed' });
        }
    }
};

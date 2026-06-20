import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { ModerationService } from '../../services/moderationService.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { guardDefer } from '../../utils/commandGuards.js';

export default {
    data: new SlashCommandBuilder()
        .setName("untimeout")
        .setDescription("Remove timeout from a user")
        .addUserOption((option) =>
            option
                .setName("target")
                .setDescription("User to untimeout")
                .setRequired(true),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    category: "moderation",

    async execute(interaction, config, client) {
        if (!await guardDefer(interaction, 'untimeout')) return;

        try {
                const targetUser = interaction.options.getUser("target");
                const member = interaction.options.getMember("target");

                
                const result = await ModerationService.removeTimeoutUser({
                    guild: interaction.guild,
                    member,
                    moderator: interaction.member
                });

                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        successEmbed(
                            `🔓 **Removed timeout** from ${targetUser.tag}`,
                        ),
                    ],
                });
        } catch (error) {
            logger.error('Untimeout command error:', error);
            await handleInteractionError(interaction, error, { subtype: 'untimeout_failed' });
        }
    }
};




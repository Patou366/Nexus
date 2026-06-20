import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import { logEvent } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { guardDefer, guardPermission } from '../../utils/commandGuards.js';

export default {
    data: new SlashCommandBuilder()
        .setName("unlock")
        .setDescription(
            "Unlocks the current channel (allows @everyone to send messages again).",
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    category: "moderation",

    async execute(interaction, config, client) {
        if (!await guardDefer(interaction, 'unlock')) return;

        try {
            guardPermission(interaction, PermissionFlagsBits.ManageChannels, 'Manage Channels');

            const channel = interaction.channel;
            const everyoneRole = interaction.guild.roles.everyone;

            const currentPermissions = channel.permissionsFor(everyoneRole);
            if (
                currentPermissions.has(PermissionFlagsBits.SendMessages) === true ||
                currentPermissions.has(PermissionFlagsBits.SendMessages) === null
            ) {
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        errorEmbed(
                            "Channel Already Unlocked",
                            `${channel} is not explicitly locked (everyone can already send messages).`,
                        ),
                    ],
                });
            }

            await channel.permissionOverwrites.edit(
                everyoneRole,
                { SendMessages: true },
                {
                    type: 0,
                    reason: `Channel unlocked by ${interaction.user.tag}`,
                },
            );

            await logEvent({
                client,
                guild: interaction.guild,
                event: {
                    action: "Channel Unlocked",
                    target: channel.toString(),
                    executor: `${interaction.user.tag} (${interaction.user.id})`,
                    metadata: {
                        channelId: channel.id,
                        category: channel.parent?.name || 'None'
                    }
                }
            });

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    successEmbed(
                        `🔓 **Channel Unlocked**`,
                        `${channel} is now unlocked. You may speak now.`,
                    ),
                ],
            });
        } catch (error) {
            logger.error('Unlock command error:', error);
            await handleInteractionError(interaction, error, { subtype: 'unlock_failed' });
        }
    }
};

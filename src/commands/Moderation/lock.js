import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import { logEvent } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { guardDefer, guardPermission } from '../../utils/commandGuards.js';

export default {
    data: new SlashCommandBuilder()
        .setName("lock")
        .setDescription(
            "Locks the current channel (prevents @everyone from sending messages).",
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    category: "moderation",

    async execute(interaction, config, client) {
        if (!await guardDefer(interaction, 'lock')) return;

        try {
            guardPermission(interaction, PermissionFlagsBits.ManageChannels, 'Manage Channels');

            const channel = interaction.channel;
            const everyoneRole = interaction.guild.roles.everyone;

            const currentPermissions = channel.permissionsFor(everyoneRole);
            if (currentPermissions.has(PermissionFlagsBits.SendMessages) === false) {
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        errorEmbed(
                            "Channel Already Locked",
                            `${channel} is already locked.`,
                        ),
                    ],
                });
            }

            await channel.permissionOverwrites.edit(
                everyoneRole,
                { SendMessages: false },
                { type: 0, reason: `Channel locked by ${interaction.user.tag}` },
            );

            await logEvent({
                client,
                guild: interaction.guild,
                event: {
                    action: "Channel Locked",
                    target: channel.toString(),
                    executor: `${interaction.user.tag} (${interaction.user.id})`,
                    metadata: {
                        channelId: channel.id,
                        category: channel.parent?.name || 'None',
                        moderatorId: interaction.user.id
                    }
                }
            });

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    successEmbed(
                        `🔒 **Channel Locked**`,
                        `${channel} is now locked down. No one can speak here now.`,
                    ),
                ],
            });
        } catch (error) {
            logger.error('Lock command error:', error);
            await handleInteractionError(interaction, error, { subtype: 'lock_failed' });
        }
    }
};

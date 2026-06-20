import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import { logEvent } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { guardDefer, guardPermission, guardRateLimit } from '../../utils/commandGuards.js';

export default {
    data: new SlashCommandBuilder()
        .setName("purge")
        .setDescription("Delete a specific amount of messages")
        .addIntegerOption((option) =>
            option
                .setName("amount")
                .setDescription("Number of messages (1-100)")
                .setRequired(true),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    category: "moderation",

    async execute(interaction, config, client) {
        if (!await guardDefer(interaction, 'purge')) return;

        try {
            guardPermission(interaction, PermissionFlagsBits.ManageMessages, 'Manage Messages');

            const amount = interaction.options.getInteger("amount");
            const channel = interaction.channel;

            if (amount < 1 || amount > 100) {
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        errorEmbed(
                            "Invalid Amount",
                            "Please specify a number between 1 and 100.",
                        ),
                    ],
                });
            }

            if (!await guardRateLimit(interaction, 'purge', 5, 60000)) return;

            const fetched = await channel.messages.fetch({ limit: amount });
            const deleted = await channel.bulkDelete(fetched, true);
            const deletedCount = deleted.size;

            await logEvent({
                client,
                guild: interaction.guild,
                event: {
                    action: "Messages Purged",
                    target: `${channel} (${deletedCount} messages)`,
                    executor: `${interaction.user.tag} (${interaction.user.id})`,
                    reason: `Deleted ${deletedCount} messages`,
                    metadata: {
                        channelId: channel.id,
                        messageCount: deletedCount,
                        requestedAmount: amount,
                        moderatorId: interaction.user.id
                    }
                }
            });

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    successEmbed(`🗑️ Deleted ${deletedCount} messages in ${channel}.`),
                ],
                flags: MessageFlags.Ephemeral,
            });

            setTimeout(() => {
                interaction.deleteReply().catch(err =>
                    logger.debug('Failed to auto-delete purge response:', err)
                );
            }, 3000);
        } catch (error) {
            logger.error('Purge command error:', error);
            await handleInteractionError(interaction, error, { subtype: 'purge_failed' });
        }
    }
};

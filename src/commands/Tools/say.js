import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType,
    MessageFlags,
} from 'discord.js';
import { errorEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';

export default {
    data: new SlashCommandBuilder()
        .setName('say')
        .setDescription('Make Nexus send a message to any channel')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addStringOption(option =>
            option
                .setName('message')
                .setDescription('The message to send')
                .setRequired(true)
                .setMaxLength(2000)
        )
        .addChannelOption(option =>
            option
                .setName('channel')
                .setDescription('Channel to send the message in (defaults to current channel)')
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                .setRequired(false)
        ),

    async execute(interaction) {
        await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

        try {
            const message = interaction.options.getString('message', true);
            const target  = interaction.options.getChannel('channel') ?? interaction.channel;

            // Verify the bot can send messages in the target channel
            const botMember = interaction.guild.members.me;
            if (!target.permissionsFor(botMember)?.has('SendMessages')) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed(
                        'Missing Permissions',
                        `I don't have permission to send messages in ${target}.`
                    )],
                });
            }

            await target.send(message);

            logger.info(
                `[Say] ${interaction.user.tag} sent a message to #${target.name} in ${interaction.guild.name}`
            );

            await InteractionHelper.safeEditReply(interaction, {
                content: `✅ Message sent to ${target}.`,
            });
        } catch (error) {
            logger.error('Error in /say command:', error);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('Error', 'Failed to send the message. Please try again.')],
            });
        }
    },
};

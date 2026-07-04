import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { handleInteractionError } from '../../utils/errorHandler.js';

const BARCA_BLUE = 0x004D98;

export default {
    data: new SlashCommandBuilder()
        .setName('partnership-rules')
        .setDescription('Display partnership requirements and rules')
        .setDMPermission(false),

    async execute(interaction) {
        try {
            const embed = new EmbedBuilder()
                .setColor(BARCA_BLUE)
                .setTitle('🤝 PARTNERSHIP REQUIREMENTS & RULES 🤝')
                .setDescription(
                    'Hello everyone! The staff team wants to clarify how our partnership system works and set some clear guidelines moving forward. ' +
                    'Please read this carefully before opening a partnership ticket.'
                )
                .addFields(
                    {
                        name: '📊 REQUIREMENTS',
                        value:
                            'To partner with us, your server must meet the following criteria:\n\n' +
                            '👥 **Member Count:** Your server must have at least **1,200 members**.\n' +
                            '💬 **Activity:** Your server must have a healthy, active chat (either consistently active or showing strong peak activity times).',
                        inline: false
                    },
                    {
                        name: '⚙️ PARTNERSHIP RULES & PING TIERS',
                        value:
                            'Our ping policy depends entirely on your server\'s size:\n\n' +
                            '🟢 **Tier 1 (2,000+ Members):** We will post your ad in #🤝・partnerships and use our **Culés Ping** role to give your server maximum exposure.\n' +
                            '🟡 **Tier 2 (1,200 – 1,999 Members):** We will gladly post your ad in #🤝・partnerships, but it will be **without a ping**.',
                        inline: false
                    },
                    {
                        name: '⚠️ NOTE REGARDING OLD PARTNERSHIPS',
                        value:
                            'For anyone saying, *"But there are past partners with less than 1,200 members,"* please note:\n' +
                            'Those partnerships were approved during a period when the Owner was unable to access Discord, and staff members were approving partnerships without checking requirements. ' +
                            'Those servers have either been terminated or are being grandfathered in. Moving forward, **no exceptions** will be made to the 1,200-member rule.',
                        inline: false
                    }
                )
                .setFooter({ text: 'Thank you for understanding! — The FC Barcelona Staff Team' });

            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            await handleInteractionError(interaction, error, { type: 'command', commandName: 'partnership-rules' });
        }
    },
};

import { MessageFlags } from 'discord.js';
import { db } from '../../utils/database.js';
import { logger } from '../../utils/logger.js';

// Handles buttons posted by /embedbuilder with customId: eb_btn:<guildId>:<key>:<btnIndex>
export default {
    name: 'eb_btn',
    async execute(interaction, client, args) {
        // args = [guildId, key, btnIndex]  (split on ':' by interactionCreate)
        const [guildId, key, btnIndex] = args;

        try {
            const data = await db.get(`guild:${guildId}:embedbutton:${key}`);

            if (!data || !Array.isArray(data.buttons)) {
                return interaction.reply({
                    content: 'This button is no longer configured.',
                    flags: MessageFlags.Ephemeral,
                });
            }

            const idx = parseInt(btnIndex, 10);
            const btn = data.buttons[idx];

            if (!btn) {
                return interaction.reply({
                    content: 'This button configuration could not be found.',
                    flags: MessageFlags.Ephemeral,
                });
            }

            await interaction.reply({
                content: btn.message,
                flags: MessageFlags.Ephemeral,
            });
        } catch (error) {
            logger.error('Error in embedButton handler:', error);
            await interaction.reply({
                content: 'An error occurred while processing this button.',
                flags: MessageFlags.Ephemeral,
            }).catch(() => {});
        }
    },
};

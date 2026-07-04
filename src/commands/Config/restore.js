import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
    MessageFlags
} from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import { getServerSave, restoreServerFromSnapshot } from '../../services/serverBackupService.js';
import { getColor } from '../../config/bot.js';

export default {
    data: new SlashCommandBuilder()
        .setName("restore")
        .setDescription("Restore server channels from backup / Restaurar canales desde copia de seguridad")
        .addStringOption(option =>
            option
                .setName('id')
                .setDescription('The Save ID to restore from / El ID de la copia de seguridad a restaurar')
                .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction, guildConfig, client) {
        await InteractionHelper.safeDefer(interaction);

        const guild = interaction.guild;
        const saveId = interaction.options.getString('id').toUpperCase();

        // Check for admin permission (double-check)
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            const errorEmbed = createEmbed({
                title: 'Permission Denied / Permiso Denegado',
                description: 'You need Administrator permission to use this command. / Necesitas permiso de Administrador para usar este comando.',
                color: 'error'
            });
            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed],
                flags: MessageFlags.Ephemeral
            });
        }

        try {
            // Get the save
            const snapshot = await getServerSave(guild.id, saveId);

            if (!snapshot) {
                const notFoundEmbed = createEmbed({
                    title: 'Save Not Found / Copia de Seguridad No Encontrada',
                    description: `No backup found with ID \`${saveId}\`. Use \`/save-server-list\` to see available saves.\n\nNo se encontro copia de seguridad con ID \`${saveId}\`. Usa \`/save-server-list\` para ver los guardados disponibles.`,
                    color: 'error'
                });
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [notFoundEmbed],
                    flags: MessageFlags.Ephemeral
                });
            }

            // Start restoration
            const startEmbed = createEmbed({
                title: 'Restoration Started / Restauracion Iniciada',
                description: `Restoring channels from backup \`${saveId}\`...\n\nRestaurando canales desde la copia de seguridad \`${saveId}\`...`,
                color: 'warning'
            });

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [startEmbed]
            });

            // Perform the restoration
            const results = await restoreServerFromSnapshot(guild, snapshot);

            // Build the results embed
            const nothingCreated = results.rolesCreated === 0 &&
                                   results.categoriesCreated === 0 &&
                                   results.channelsCreated === 0;

            const embed = new EmbedBuilder()
                .setColor(getColor('success'))
                .setTitle('Restoration Complete / Restauracion Completa')
                .setDescription(
                    nothingCreated
                        ? `Everything already existed — settings and permissions updated.\n\nTodo ya existía — configuración y permisos actualizados.`
                        : `Successfully restored from backup \`${saveId}\`.\n\nSe restauro exitosamente desde la copia de seguridad \`${saveId}\`.`
                )
                .addFields(
                    {
                        name: 'Roles',
                        value: `Created: **${results.rolesCreated}**\nUpdated: **${results.rolesUpdated}**`,
                        inline: true
                    },
                    {
                        name: 'Categories',
                        value: `Created: **${results.categoriesCreated}**\nUpdated: **${results.categoriesUpdated}**`,
                        inline: true
                    },
                    {
                        name: 'Channels',
                        value: `Created: **${results.channelsCreated}**\nUpdated: **${results.channelsUpdated}**`,
                        inline: true
                    },
                    {
                        name: 'Server Settings',
                        value: results.settingsRestored ? '✅ Restored' : '⚠️ Skipped (no change or no permission)',
                        inline: true
                    },
                    {
                        name: 'Backup Date / Fecha de la Copia',
                        value: `<t:${Math.floor(snapshot.createdAt / 1000)}:f>`,
                        inline: true
                    }
                )
                .setTimestamp()
                .setFooter({
                    text: `Restored by ${interaction.user.tag} / Restaurado por ${interaction.user.tag}`
                });

            // Add errors if any
            if (results.errors.length > 0) {
                let errorText = results.errors.map(e => `• ${e}`).join('\n');
                if (errorText.length > 1000) {
                    errorText = errorText.substring(0, 990) + '\n... (truncated)';
                }
                embed.addFields({
                    name: 'Errors / Errores',
                    value: errorText,
                    inline: false
                });
                embed.setColor(getColor('warning'));
            }

            await interaction.editReply({
                embeds: [embed]
            });

            logger.info(`Server restoration completed for guild ${guild.id} from save ${saveId}`, results);

        } catch (error) {
            logger.error('Error in restore command:', error);

            const errorEmbed = createEmbed({
                title: 'Restoration Failed / Restauracion Fallida',
                description: `An error occurred during restoration: ${error.message}\n\nOcurrio un error durante la restauracion: ${error.message}`,
                color: 'error'
            });

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed],
                flags: MessageFlags.Ephemeral
            });
        }
    },
};

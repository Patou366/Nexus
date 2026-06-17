import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
    MessageFlags
} from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import { getServerSaves, getServerSave } from '../../services/serverBackupService.js';
import { getColor } from '../../config/bot.js';

export default {
    data: new SlashCommandBuilder()
        .setName("save-server-list")
        .setDescription("List all saved server snapshots / Listar todas las copias de seguridad del servidor")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction, guildConfig, client) {
        await InteractionHelper.safeDefer(interaction);

        const guild = interaction.guild;

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
            const saves = await getServerSaves(guild.id);

            if (saves.length === 0) {
                const noSavesEmbed = createEmbed({
                    title: 'No Saves Found / No se encontraron copias de seguridad',
                    description: 'No server snapshots have been saved for this server. Use `/save-server` to create one.\n\nNo se han guardado copias de seguridad para este servidor. Usa `/save-server` para crear una.',
                    color: 'info'
                });
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [noSavesEmbed]
                });
            }

            // Sort saves by creation date (newest first)
            saves.sort((a, b) => b.createdAt - a.createdAt);

            const embed = new EmbedBuilder()
                .setColor(getColor('primary'))
                .setTitle('Server Backups / Copias de Seguridad del Servidor')
                .setDescription(`Found **${saves.length}** saved snapshot(s) for this server.\n\nSe encontraron **${saves.length}** copia(s) de seguridad guardadas para este servidor.`)
                .setTimestamp()
                .setFooter({ text: `Server: ${guild.name}` });

            // Add fields for each save
            for (const save of saves) {
                const date = new Date(save.createdAt);
                const formattedDate = `<t:${Math.floor(date.getTime() / 1000)}:f>`;
                const relativeDate = `<t:${Math.floor(date.getTime() / 1000)}:R>`;

                embed.addFields({
                    name: `Save ID: \`${save.saveId}\` / ID de Guardado: \`${save.saveId}\``,
                    value: `**Created / Creado:** ${formattedDate} (${relativeDate})\n` +
                           `**Channels / Canales:** ${save.channelCount}\n` +
                           `**Creator / Creador:** <@${save.creatorId}>`,
                    inline: false
                });
            }

            embed.addFields({
                name: 'How to Restore / Como Restaurar',
                value: 'Use `/restore <save_id>` to restore channels from a backup.\n' +
                       'Usa `/restore <id_guardado>` para restaurar canales desde una copia de seguridad.',
                inline: false
            });

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [embed]
            });

        } catch (error) {
            logger.error('Error in save-server-list command:', error);

            const errorEmbed = createEmbed({
                title: 'Error / Error',
                description: 'An error occurred while fetching the backup list. / Ocurrio un error al obtener la lista de copias de seguridad.',
                color: 'error'
            });

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed],
                flags: MessageFlags.Ephemeral
            });
        }
    },
};

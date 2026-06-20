import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    MessageFlags
} from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import {
    saveServerSnapshot,
    captureServerLayout,
    getServerSaves,
    MAX_SAVES_PER_GUILD
} from '../../services/serverBackupService.js';

export default {
    data: new SlashCommandBuilder()
        .setName("save-server")
        .setDescription("Take a snapshot of the server layout / Tomar una instantanea del diseño del servidor")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction, guildConfig, client) {
        await InteractionHelper.safeDefer(interaction);

        const guild = interaction.guild;
        const userId = interaction.user.id;

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
            // Check current saves count
            const existingSaves = await getServerSaves(guild.id);

            // Capture the server layout
            const snapshot = captureServerLayout(guild, userId);

            // Save the snapshot
            const result = await saveServerSnapshot(guild.id, snapshot);

            const totalChannels = snapshot.categories.reduce((acc, cat) => acc + cat.channels.length, 0);
            const totalCategories = snapshot.categories.filter(c => c.id !== null).length;
            const totalRoles = snapshot.roles ? snapshot.roles.length : 0;

            let description = `Successfully saved server layout! / ¡Diseño del servidor guardado exitosamente!\n\n`;
            description += `**Save ID / ID de Guardado:** \`${result.saveId}\`\n`;
            description += `**Roles Captured / Roles Capturados:** ${totalRoles}\n`;
            description += `**Channels Captured / Canales Capturados:** ${totalChannels}\n`;
            description += `**Categories Captured / Categorias Capturadas:** ${totalCategories}\n`;
            description += `**Saves Remaining / Guardados Restantes:** ${MAX_SAVES_PER_GUILD - existingSaves.length}/${MAX_SAVES_PER_GUILD}`;

            if (result.overwritten) {
                description += `\n\n⚠️ **Oldest save overwritten / Guardado mas antiguo sobrescrito:** \`${result.overwritten}\``;
            }

            const successEmbed = createEmbed({
                title: 'Server Backup Created / Copia de Seguridad Creada',
                description,
                color: 'success'
            });

            successEmbed.setFooter({
                text: `Created by ${interaction.user.tag} / Creado por ${interaction.user.tag}`
            });
            successEmbed.setTimestamp();

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [successEmbed]
            });

            logger.info(`Server backup created by ${userId} for guild ${guild.id}: ${result.saveId}`);

        } catch (error) {
            logger.error('Error in save-server command:', error);

            const errorEmbed = createEmbed({
                title: 'Error / Error',
                description: 'An error occurred while saving the server layout. / Ocurrio un error al guardar el diseño del servidor.',
                color: 'error'
            });

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed],
                flags: MessageFlags.Ephemeral
            });
        }
    },
};

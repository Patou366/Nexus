import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    MessageFlags
} from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import { getGuildConfig, setGuildConfig } from '../../services/guildConfig.js';

export default {
    data: new SlashCommandBuilder()
        .setName('admin-set')
        .setDescription('Set the admin role for the server / Establecer el rol de administrador del servidor')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addRoleOption(option =>
            option
                .setName('role')
                .setDescription('The role to assign admin permissions / El rol al que asignar permisos de administrador')
                .setRequired(true)
        ),

    async execute(interaction, guildConfig, client) {
        await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

        if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [createEmbed({
                    title: 'Permission Denied / Permiso Denegado',
                    description: 'You need Administrator permission to use this command.\nNecesitas permiso de Administrador para usar este comando.',
                    color: 'error'
                })],
                flags: MessageFlags.Ephemeral
            });
        }

        const role = interaction.options.getRole('role');
        const config = guildConfig || await getGuildConfig(client, interaction.guild.id);

        try {
            await setGuildConfig(client, interaction.guild.id, { ...config, adminRole: role.id });

            logger.info(`Admin role set to ${role.id} (${role.name}) in guild ${interaction.guild.id} by ${interaction.user.id}`);

            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [createEmbed({
                    title: 'Admin Role Set / Rol de Administrador Establecido',
                    description: `The admin role has been set to ${role}.\nEl rol de administrador ha sido establecido a ${role}.`,
                    color: 'success',
                    fields: [
                        { name: 'Role / Rol', value: `${role} (\`${role.id}\`)`, inline: true }
                    ]
                })],
                flags: MessageFlags.Ephemeral
            });
        } catch (error) {
            logger.error('Error in admin-set command:', error);
            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [createEmbed({
                    title: 'Error',
                    description: 'Failed to save the admin role. Please try again.\nFallo al guardar el rol de administrador. Intentalo de nuevo.',
                    color: 'error'
                })],
                flags: MessageFlags.Ephemeral
            });
        }
    }
};

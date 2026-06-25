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
        .setName('mod-set')
        .setDescription('Set the moderator role for the server / Establecer el rol de moderador del servidor')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addRoleOption(option =>
            option
                .setName('role')
                .setDescription('The role to assign mod permissions / El rol al que asignar permisos de moderador')
                .setRequired(true)
        ),

    async execute(interaction, guildConfig, client) {
        await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

        const config = guildConfig || await getGuildConfig(client, interaction.guild.id);
        const adminRole = config?.adminRole;

        const isAdmin =
            interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
            (adminRole && interaction.member.roles.cache.has(adminRole));

        if (!isAdmin) {
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

        try {
            await setGuildConfig(client, interaction.guild.id, { ...config, modRole: role.id });

            logger.info(`Mod role set to ${role.id} (${role.name}) in guild ${interaction.guild.id} by ${interaction.user.id}`);

            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [createEmbed({
                    title: 'Mod Role Set / Rol de Moderador Establecido',
                    description: `The moderator role has been set to ${role}.\nEl rol de moderador ha sido establecido a ${role}.`,
                    color: 'success',
                    fields: [
                        { name: 'Role / Rol', value: `${role} (\`${role.id}\`)`, inline: true }
                    ]
                })],
                flags: MessageFlags.Ephemeral
            });
        } catch (error) {
            logger.error('Error in mod-set command:', error);
            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [createEmbed({
                    title: 'Error',
                    description: 'Failed to save the mod role. Please try again.\nFallo al guardar el rol de moderador. Intentalo de nuevo.',
                    color: 'error'
                })],
                flags: MessageFlags.Ephemeral
            });
        }
    }
};

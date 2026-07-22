import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
    MessageFlags,
} from 'discord.js';
import { getColor } from '../../config/bot.js';
import { logger } from '../../utils/logger.js';
import { errorEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { guardDefer, guardPermission } from '../../utils/commandGuards.js';
import {
    isUserAllowed,
    addPermUser,
    removePermUser,
    listPermUsers,
} from '../../services/permGuardService.js';

export default {
    data: new SlashCommandBuilder()
        .setName('perm')
        .setDescription('Manage who can edit or delete channels and roles')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand((sub) =>
            sub
                .setName('grant')
                .setDescription('Grant a user permission to edit/delete channels and roles')
                .addUserOption((opt) =>
                    opt
                        .setName('user')
                        .setDescription('User to grant permission to')
                        .setRequired(true)
                )
        )
        .addSubcommand((sub) =>
            sub
                .setName('revoke')
                .setDescription("Revoke a user's permission to edit/delete channels and roles")
                .addUserOption((opt) =>
                    opt
                        .setName('user')
                        .setDescription('User to revoke permission from')
                        .setRequired(true)
                )
        )
        .addSubcommand((sub) =>
            sub
                .setName('list')
                .setDescription('List all users with perm guard access')
        ),

    async execute(interaction, config, client) {
        if (!await guardDefer(interaction, 'perm', { flags: MessageFlags.Ephemeral })) return;

        try {
            guardPermission(interaction, PermissionFlagsBits.Administrator, 'Administrator');

            const sub = interaction.options.getSubcommand();
            const { guild } = interaction;

            // ── grant ────────────────────────────────────────────────────────
            if (sub === 'grant') {
                const target = interaction.options.getUser('user');
                const member = interaction.options.getMember('user');

                if (target.bot) {
                    return await InteractionHelper.safeEditReply(interaction, {
                        embeds: [errorEmbed('Invalid Target', 'You cannot grant permission to a bot.')],
                    });
                }

                if (member?.permissions.has(PermissionFlagsBits.Administrator)) {
                    return await InteractionHelper.safeEditReply(interaction, {
                        embeds: [errorEmbed(
                            'Already Allowed',
                            `${target} is an Administrator and is always allowed to edit/delete channels and roles.`
                        )],
                    });
                }

                const already = await isUserAllowed(client, guild.id, target.id);
                if (already) {
                    return await InteractionHelper.safeEditReply(interaction, {
                        embeds: [errorEmbed(
                            'Already Granted / Ya Concedido',
                            `${target} already has permission.\nUse \`/perm revoke\` to remove it.`
                        )],
                    });
                }

                const ok = await addPermUser(client, guild.id, target.id);
                if (!ok) {
                    return await InteractionHelper.safeEditReply(interaction, {
                        embeds: [errorEmbed('Database Error', 'Could not save the permission. Please try again.')],
                    });
                }

                logger.info(`[PermGuard] ${interaction.user.tag} granted perm to ${target.tag} in guild ${guild.id}`);

                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        new EmbedBuilder()
                            .setColor(getColor('success'))
                            .setTitle('✅ Permission Granted / Permiso Concedido')
                            .setDescription(
                                `${target} can now **edit and delete channels, roles, and categories** without being kicked.\n\n` +
                                `${target} ahora puede **editar y eliminar canales, roles y categorías** sin ser expulsado/a.`
                            )
                            .setTimestamp(),
                    ],
                });
            }

            // ── revoke ───────────────────────────────────────────────────────
            if (sub === 'revoke') {
                const target = interaction.options.getUser('user');

                const has = await isUserAllowed(client, guild.id, target.id);
                if (!has) {
                    return await InteractionHelper.safeEditReply(interaction, {
                        embeds: [errorEmbed(
                            'Not in List / No está en la lista',
                            `${target} does not have perm guard access to revoke.\n` +
                            `${target} no tiene permiso de perm guard para revocar.`
                        )],
                    });
                }

                const ok = await removePermUser(client, guild.id, target.id);
                if (!ok) {
                    return await InteractionHelper.safeEditReply(interaction, {
                        embeds: [errorEmbed('Database Error', 'Could not remove the permission. Please try again.')],
                    });
                }

                logger.info(`[PermGuard] ${interaction.user.tag} revoked perm from ${target.tag} in guild ${guild.id}`);

                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        new EmbedBuilder()
                            .setColor(getColor('warning'))
                            .setTitle('🚫 Permission Revoked / Permiso Revocado')
                            .setDescription(
                                `${target} can **no longer** edit or delete channels, roles, or categories.\n` +
                                `If they try to do so, they will be automatically kicked and logged.\n\n` +
                                `${target} **ya no puede** editar ni eliminar canales, roles ni categorías.\n` +
                                `Si lo intenta, será expulsado/a automáticamente y se registrará el evento.`
                            )
                            .setTimestamp(),
                    ],
                });
            }

            // ── list ─────────────────────────────────────────────────────────
            if (sub === 'list') {
                const userIds = await listPermUsers(client, guild.id);

                if (userIds.length === 0) {
                    return await InteractionHelper.safeEditReply(interaction, {
                        embeds: [
                            new EmbedBuilder()
                                .setColor(getColor('info'))
                                .setTitle('🛡️ Perm Guard Access List')
                                .setDescription(
                                    'No users have been granted perm guard access.\n' +
                                    'Use `/perm grant <user>` to allow a non-admin user to edit/delete channels and roles.\n\n' +
                                    'Ningún usuario tiene acceso de perm guard.\n' +
                                    'Usa `/perm grant <usuario>` para permitirlo.'
                                )
                                .setTimestamp(),
                        ],
                    });
                }

                const mentions = userIds.map((id) => `<@${id}>`).join('\n');

                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        new EmbedBuilder()
                            .setColor(getColor('info'))
                            .setTitle('🛡️ Perm Guard Access List')
                            .setDescription(
                                `The following users can edit/delete channels and roles without being kicked.\n` +
                                `Los siguientes usuarios pueden editar/eliminar canales y roles sin ser expulsados.\n\n` +
                                mentions
                            )
                            .addFields({
                                name: 'Total / Total',
                                value: `${userIds.length} user${userIds.length !== 1 ? 's' : ''}`,
                                inline: true,
                            })
                            .setFooter({ text: 'Administrators and the server owner are always exempt.' })
                            .setTimestamp(),
                    ],
                });
            }
        } catch (error) {
            logger.error('[PermGuard] Error in /perm command:', error);
            await handleInteractionError(interaction, error, { type: 'command', commandName: 'perm' });
        }
    },
};

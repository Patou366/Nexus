import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { getColor } from '../../config/bot.js';
import { logger } from '../../utils/logger.js';
import { errorEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { guardDefer, guardPermission } from '../../utils/commandGuards.js';

// How many members to process per batch before pausing
const BATCH_SIZE = 5;
// Delay between batches in ms — keeps us well under Discord's rate limit
const BATCH_DELAY_MS = 1000;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export default {
    data: new SlashCommandBuilder()
        .setName('roleall')
        .setDescription('Give a role to every member in the server')
        .addRoleOption(option =>
            option
                .setName('role')
                .setDescription('The role to assign to all members')
                .setRequired(true)
        )
        .addBooleanOption(option =>
            option
                .setName('skip_bots')
                .setDescription('Skip bot accounts (default: true)')
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    category: 'tools',

    async execute(interaction, config, client) {
        if (!await guardDefer(interaction, 'roleall')) return;

        try {
            guardPermission(interaction, PermissionFlagsBits.Administrator, 'Administrator');

            const role = interaction.options.getRole('role');
            const skipBots = interaction.options.getBoolean('skip_bots') ?? true;
            const { guild } = interaction;

            // Safety: role must be below the bot's highest role
            if (role.position >= guild.members.me.roles.highest.position) {
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed(
                        'Role Too High / Rol Demasiado Alto',
                        "I can't assign a role that is at or above my highest role.\n" +
                        'No puedo asignar un rol que esté igual o por encima de mi rol más alto.'
                    )],
                });
            }

            // Safety: can't assign @everyone or a managed/integration role
            if (role.id === guild.id) {
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed(
                        'Invalid Role / Rol Inválido',
                        'You cannot assign the @everyone role.\n' +
                        'No puedes asignar el rol @everyone.'
                    )],
                });
            }

            if (role.managed) {
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed(
                        'Managed Role / Rol Gestionado',
                        'That role is managed by an integration and cannot be assigned manually.\n' +
                        'Ese rol está gestionado por una integración y no se puede asignar manualmente.'
                    )],
                });
            }

            // Fetch all members (handles large servers via pagination automatically)
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    new EmbedBuilder()
                        .setColor(getColor('primary'))
                        .setTitle('⏳ Fetching members... / Obteniendo miembros...')
                        .setDescription(
                            `Preparing to assign ${role} to all ${skipBots ? 'non-bot ' : ''}members.\n` +
                            `Preparando para asignar ${role} a todos los miembros${skipBots ? ' (sin bots)' : ''}.`
                        )
                ],
            });

            const allMembers = await guild.members.fetch();
            const targets = allMembers.filter(m => {
                if (skipBots && m.user.bot) return false;
                if (m.roles.cache.has(role.id)) return false; // already has the role
                return true;
            });

            const total = targets.size;

            if (total === 0) {
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        new EmbedBuilder()
                            .setColor(getColor('success'))
                            .setTitle('✅ Nothing to do / Nada que hacer')
                            .setDescription(
                                `All ${skipBots ? 'non-bot ' : ''}members already have ${role}.\n` +
                                `Todos los miembros${skipBots ? ' (sin bots)' : ''} ya tienen ${role}.`
                            )
                    ],
                });
            }

            logger.info(`[Roleall] Starting role assignment: role=${role.name} (${role.id}), targets=${total}, guild=${guild.name} (${guild.id}), executor=${interaction.user.tag}`);

            let succeeded = 0;
            let failed = 0;
            const memberArray = [...targets.values()];

            // Process in batches to stay within Discord rate limits without blocking the bot
            for (let i = 0; i < memberArray.length; i += BATCH_SIZE) {
                const batch = memberArray.slice(i, i + BATCH_SIZE);

                await Promise.allSettled(
                    batch.map(async member => {
                        try {
                            await member.roles.add(role, `roleall by ${interaction.user.tag}`);
                            succeeded++;
                        } catch (err) {
                            failed++;
                            logger.warn(`[Roleall] Failed to add role to ${member.user.tag} (${member.id}): ${err.message}`);
                        }
                    })
                );

                // Update progress every 10 batches (every 50 members) to avoid hitting edit rate limits
                if (i > 0 && (i / BATCH_SIZE) % 10 === 0) {
                    const done = Math.min(i + BATCH_SIZE, total);
                    await InteractionHelper.safeEditReply(interaction, {
                        embeds: [
                            new EmbedBuilder()
                                .setColor(getColor('primary'))
                                .setTitle('⏳ In progress... / En progreso...')
                                .setDescription(
                                    `Assigning ${role} to all members...\n` +
                                    `Asignando ${role} a todos los miembros...\n\n` +
                                    `**${done} / ${total}** processed`
                                )
                        ],
                    }).catch(() => {}); // ignore edit failures during progress updates
                }

                // Wait between batches to respect rate limits
                if (i + BATCH_SIZE < memberArray.length) {
                    await sleep(BATCH_DELAY_MS);
                }
            }

            logger.info(`[Roleall] Completed: role=${role.name}, succeeded=${succeeded}, failed=${failed}, guild=${guild.name}`);

            const embed = new EmbedBuilder()
                .setColor(failed === 0 ? getColor('success') : getColor('warning'))
                .setTitle('✅ Role Assignment Complete / Asignación de Rol Completa')
                .addFields(
                    { name: '🎭 Role / Rol', value: `${role}`, inline: true },
                    { name: '✅ Succeeded / Éxito', value: `${succeeded}`, inline: true },
                    { name: '❌ Failed / Fallido', value: `${failed}`, inline: true },
                )
                .setFooter({ text: `Executed by ${interaction.user.tag} / Ejecutado por ${interaction.user.tag}` })
                .setTimestamp();

            if (failed > 0) {
                embed.setDescription(
                    `Some assignments failed — the bot may lack permission to assign that role to certain members (e.g. members with higher roles).\n` +
                    `Algunas asignaciones fallaron — puede que el bot no tenga permiso para asignar ese rol a ciertos miembros.`
                );
            }

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });

        } catch (error) {
            logger.error('[Roleall] Error in roleall command:', error);
            await handleInteractionError(interaction, error, {
                type: 'command',
                commandName: 'roleall'
            });
        }
    },
};

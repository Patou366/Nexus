import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
    MessageFlags
} from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import { getFromDb } from '../../utils/database.js';
import { WarningService } from '../../services/warningService.js';
import { getColor } from '../../config/bot.js';

export default {
    data: new SlashCommandBuilder()
        .setName("modsummary")
        .setDescription("Generate a moderation profile summary for a user")
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('The user to generate a moderation profile for / El usuario para generar un perfil de moderacion')
                .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    async execute(interaction, guildConfig, client) {
        await InteractionHelper.safeDefer(interaction);

        const targetUser = interaction.options.getUser('user');
        const guildId = interaction.guild.id;

        try {
            // Fetch warnings
            const warnings = await WarningService.getWarnings(guildId, targetUser.id);
            const activeWarnings = warnings.filter(w => w.status === 'active');

            // Fetch user notes
            const notesKey = `moderation_user_notes_${guildId}_${targetUser.id}`;
            const notes = await getFromDb(notesKey, []) || [];

            // Fetch moderation cases for this user
            const caseListKey = `moderation_cases_list_${guildId}`;
            const allCases = await getFromDb(caseListKey, []) || [];
            const userCases = allCases.filter(c => c.targetUserId === targetUser.id);

            // Categorize actions
            const bans = userCases.filter(c => c.action === 'Member Banned');
            const kicks = userCases.filter(c => c.action === 'Member Kicked');
            const timeouts = userCases.filter(c => c.action === 'Member Timed Out');
            const otherActions = userCases.filter(c =>
                !['Member Banned', 'Member Kicked', 'Member Timed Out'].includes(c.action)
            );

            // Create the moderation profile embed
            const embed = new EmbedBuilder()
                .setColor(getColor('moderation'))
                .setTitle(` Moderation Profile / Perfil de Moderacion`)
                .setDescription(`Moderation history for **${targetUser.tag}**\n\nHistorial de moderacion para **${targetUser.tag}**`)
                .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 128 }))
                .addFields(
                    {
                        name: 'User ID / ID de Usuario',
                        value: targetUser.id,
                        inline: true
                    },
                    {
                        name: 'Account Created / Cuenta Creada',
                        value: `<t:${Math.floor(targetUser.createdTimestamp / 1000)}:R>`,
                        inline: true
                    }
                )
                .addFields(
                    {
                        name: 'Total Warnings / Total de Advertencias',
                        value: `${activeWarnings.length}`,
                        inline: true
                    },
                    {
                        name: 'Total Notes / Total de Notas',
                        value: `${notes.length}`,
                        inline: true
                    },
                    {
                        name: 'Total Cases / Total de Casos',
                        value: `${userCases.length}`,
                        inline: true
                    }
                )
                .addFields(
                    {
                        name: 'Bans on Record / Bloqueos en Registro',
                        value: `${bans.length}`,
                        inline: true
                    },
                    {
                        name: 'Kicks on Record / Expulsiones en Registro',
                        value: `${kicks.length}`,
                        inline: true
                    },
                    {
                        name: 'Timeouts Received / Tiempos de Espera Recibidos',
                        value: `${timeouts.length}`,
                        inline: true
                    }
                );

            // Add timeline of recent actions (last 5)
            if (userCases.length > 0) {
                const sortedCases = [...userCases].sort((a, b) =>
                    new Date(b.createdAt) - new Date(a.createdAt)
                );
                const recentCases = sortedCases.slice(0, 5);

                let timelineText = '';
                for (const c of recentCases) {
                    const date = new Date(c.createdAt);
                    const formattedDate = `<t:${Math.floor(date.getTime() / 1000)}:d>`;
                    timelineText += `**${c.action}** - ${formattedDate}\n`;
                }

                embed.addFields({
                    name: 'Recent Actions Timeline / Linea de Tiempo de Acciones Recientes',
                    value: timelineText || 'None / Ninguna',
                    inline: false
                });
            }

            // Add warning details if any
            if (activeWarnings.length > 0) {
                const sortedWarnings = [...activeWarnings].sort((a, b) =>
                    new Date(b.timestamp) - new Date(a.timestamp)
                );
                const recentWarnings = sortedWarnings.slice(0, 3);

                let warningText = '';
                for (const w of recentWarnings) {
                    const date = new Date(w.timestamp);
                    const formattedDate = `<t:${Math.floor(date.getTime() / 1000)}:d>`;
                    warningText += `**Warning:** ${w.reason || 'No reason / Sin razon'} - ${formattedDate}\n`;
                }

                embed.addFields({
                    name: 'Recent Warnings / Advertencias Recientes',
                    value: warningText || 'None / Ninguna',
                    inline: false
                });
            }

            // Add note summary if any
            if (notes.length > 0) {
                const warningNotes = notes.filter(n => n.type === 'warning').length;
                const alertNotes = notes.filter(n => n.type === 'alert').length;
                const positiveNotes = notes.filter(n => n.type === 'positive').length;

                embed.addFields({
                    name: 'Note Summary / Resumen de Notas',
                    value: `Warning Notes: ${warningNotes} | Alert Notes: ${alertNotes} | Positive Notes: ${positiveNotes}\n` +
                           `Notas de Advertencia: ${warningNotes} | Notas de Alerta: ${alertNotes} | Notas Positivas: ${positiveNotes}`,
                    inline: false
                });
            }

            // Risk assessment
            let riskLevel = 'Low / Bajo';
            let riskColor = getColor('success');
            const totalInfractions = activeWarnings.length + bans.length + kicks.length;

            if (totalInfractions >= 5 || bans.length >= 2) {
                riskLevel = 'High / Alto';
                riskColor = getColor('error');
            } else if (totalInfractions >= 2 || timeouts.length >= 3) {
                riskLevel = 'Medium / Medio';
                riskColor = getColor('warning');
            }

            embed.addFields({
                name: 'Risk Assessment / Evaluacion de Riesgo',
                value: `**${riskLevel}** (Based on ${totalInfractions} total infractions)\n` +
                       `**(Basado en ${totalInfractions} infracciones totales)**`,
                inline: false
            });

            embed.setFooter({
                text: `Moderation Profile Generated / Perfil de Moderacion Generado`
            });
            embed.setTimestamp();

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [embed]
            });

        } catch (error) {
            logger.error('Error in modsummary command:', error);

            const errorEmbed = createEmbed({
                title: 'Error / Error',
                description: 'An error occurred while generating the moderation profile. / Ocurrio un error al generar el perfil de moderacion.',
                color: 'error'
            });

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed],
                flags: MessageFlags.Ephemeral
            });
        }
    },
};

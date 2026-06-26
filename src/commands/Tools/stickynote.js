import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    MessageFlags,
    ChannelType
} from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import {
    getStickyNote,
    setStickyNote,
    deleteStickyNote,
    listStickyNotes,
    buildStickyEmbed
} from '../../services/stickyNoteService.js';

export default {
    data: new SlashCommandBuilder()
        .setName('stickynote')
        .setDescription('Manage sticky notes in channels / Gestionar notas adhesivas en canales')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addSubcommand(sub =>
            sub.setName('set')
                .setDescription('Set or update a sticky note in a channel / Establecer o actualizar una nota adhesiva')
                .addChannelOption(opt =>
                    opt.setName('channel')
                        .setDescription('Channel to stick the note in / Canal donde fijar la nota')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true)
                )
                .addStringOption(opt =>
                    opt.setName('description')
                        .setDescription('Main content of the sticky note / Contenido principal de la nota')
                        .setRequired(true)
                        .setMaxLength(4000)
                )
                .addStringOption(opt =>
                    opt.setName('title')
                        .setDescription('Title of the embed / Título del embed')
                        .setRequired(false)
                        .setMaxLength(256)
                )
                .addStringOption(opt =>
                    opt.setName('color')
                        .setDescription('Hex color code, e.g. #FF5733 / Código de color hex')
                        .setRequired(false)
                        .setMaxLength(7)
                )
                .addStringOption(opt =>
                    opt.setName('footer')
                        .setDescription('Footer text / Texto del pie de página')
                        .setRequired(false)
                        .setMaxLength(2048)
                )
                .addStringOption(opt =>
                    opt.setName('image')
                        .setDescription('Large image URL shown at the bottom / URL de imagen grande')
                        .setRequired(false)
                )
                .addStringOption(opt =>
                    opt.setName('thumbnail')
                        .setDescription('Small image URL in top-right corner / URL de miniatura')
                        .setRequired(false)
                )
        )
        .addSubcommand(sub =>
            sub.setName('remove')
                .setDescription('Remove the sticky note from a channel / Eliminar la nota adhesiva de un canal')
                .addChannelOption(opt =>
                    opt.setName('channel')
                        .setDescription('Channel to remove the sticky note from / Canal donde quitar la nota')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub.setName('list')
                .setDescription('List all sticky notes in this server / Ver todas las notas adhesivas del servidor')
        )
        .addSubcommand(sub =>
            sub.setName('preview')
                .setDescription('Preview the sticky note of a channel / Previsualizar la nota adhesiva de un canal')
                .addChannelOption(opt =>
                    opt.setName('channel')
                        .setDescription('Channel to preview / Canal a previsualizar')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true)
                )
        ),

    async execute(interaction, guildConfig, client) {
        await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

        const sub = interaction.options.getSubcommand();

        try {
            if (sub === 'set')     return await handleSet(interaction, client);
            if (sub === 'remove')  return await handleRemove(interaction, client);
            if (sub === 'list')    return await handleList(interaction, client);
            if (sub === 'preview') return await handlePreview(interaction, client);
        } catch (error) {
            logger.error(`Error in /stickynote ${sub}:`, error);
            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [createEmbed({
                    title: '❌ Error',
                    description: 'Something went wrong. Please try again.\n\nAlgo salió mal. Por favor intenta de nuevo.',
                    color: 'error'
                })]
            });
        }
    }
};

// ─── Subcommand handlers ───────────────────────────────────────────────────

async function handleSet(interaction, client) {
    const channel     = interaction.options.getChannel('channel');
    const description = interaction.options.getString('description');
    const title       = interaction.options.getString('title')     ?? null;
    const color       = interaction.options.getString('color')     ?? null;
    const footer      = interaction.options.getString('footer')    ?? null;
    const image       = interaction.options.getString('image')     ?? null;
    const thumbnail   = interaction.options.getString('thumbnail') ?? null;

    // Check invoking user has ManageMessages in the target channel (channel overrides may deny it)
    const invokerPerms = channel.permissionsFor(interaction.member);
    if (!invokerPerms?.has('ManageMessages')) {
        return await InteractionHelper.safeEditReply(interaction, {
            embeds: [createEmbed({
                title: '❌ No Permission / Sin Permiso',
                description: `You don\'t have **Manage Messages** permission in ${channel}.\n\nNo tienes permiso de **Gestionar Mensajes** en ${channel}.`,
                color: 'error'
            })]
        });
    }

    // Check bot has permission to send messages and embeds in the target channel
    const botMember = interaction.guild.members.me;
    const botPerms = channel.permissionsFor(botMember);
    if (!botPerms?.has(['SendMessages', 'EmbedLinks'])) {
        return await InteractionHelper.safeEditReply(interaction, {
            embeds: [createEmbed({
                title: '❌ Missing Permissions / Permisos Faltantes',
                description: `I need **Send Messages** and **Embed Links** permissions in ${channel} to post a sticky note.\n\nNecesito permisos de **Enviar Mensajes** y **Insertar Links** en ${channel} para publicar una nota adhesiva.`,
                color: 'error'
            })]
        });
    }

    // Validate hex color if provided
    if (color) {
        const hex = color.startsWith('#') ? color : `#${color}`;
        if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) {
            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [createEmbed({
                    title: '❌ Invalid Color / Color Inválido',
                    description: 'Please provide a valid hex color code, e.g. `#FF5733`.\n\nPor favor proporciona un código de color hex válido, ej. `#FF5733`.',
                    color: 'error'
                })]
            });
        }
    }

    // Validate URLs if provided
    for (const [label, url] of [['image', image], ['thumbnail', thumbnail]]) {
        if (url) {
            try { new URL(url); } catch {
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [createEmbed({
                        title: `❌ Invalid ${label} URL`,
                        description: `The \`${label}\` option must be a valid URL.\n\nLa opción \`${label}\` debe ser una URL válida.`,
                        color: 'error'
                    })]
                });
            }
        }
    }

    const embedConfig = { title, description, color, footer, image, thumbnail };

    // Check if there's already a sticky in this channel (to clean up the old message)
    const existing = await getStickyNote(interaction.guild.id, channel.id);
    if (existing?.messageId) {
        const oldMsg = await channel.messages.fetch(existing.messageId).catch(() => null);
        if (oldMsg?.deletable) await oldMsg.delete().catch(() => null);
    }

    // Post the sticky note in the target channel
    const embed = buildStickyEmbed(embedConfig);
    const posted = await channel.send({ embeds: [embed] }).catch(err => {
        logger.error(`Failed to post sticky note in ${channel.id}:`, err.message);
        return null;
    });

    if (!posted) {
        return await InteractionHelper.safeEditReply(interaction, {
            embeds: [createEmbed({
                title: '❌ Could Not Post / No Se Pudo Publicar',
                description: `I don\'t have permission to send messages in ${channel}.\n\nNo tengo permiso para enviar mensajes en ${channel}.`,
                color: 'error'
            })]
        });
    }

    // Save to database
    await setStickyNote(interaction.guild.id, channel.id, {
        guildId: interaction.guild.id,
        channelId: channel.id,
        messageId: posted.id,
        embed: embedConfig,
        createdBy: interaction.user.id,
        createdAt: new Date().toISOString()
    });

    logger.info(`Sticky note set in channel ${channel.id} by ${interaction.user.id} in guild ${interaction.guild.id}`);

    // Build a summary of what was set
    const summaryFields = [
        { name: 'Channel / Canal', value: `${channel}`, inline: true },
        { name: 'Title / Título', value: title ?? '*None / Ninguno*', inline: true },
        { name: 'Color', value: color ?? '*Default / Por defecto*', inline: true }
    ];
    if (footer)    summaryFields.push({ name: 'Footer', value: footer.slice(0, 100), inline: false });
    if (image)     summaryFields.push({ name: 'Image / Imagen', value: image.slice(0, 100), inline: false });
    if (thumbnail) summaryFields.push({ name: 'Thumbnail / Miniatura', value: thumbnail.slice(0, 100), inline: false });

    return await InteractionHelper.safeEditReply(interaction, {
        embeds: [createEmbed({
            title: '📌 Sticky Note Set / Nota Adhesiva Establecida',
            description: `The sticky note has been posted in ${channel} and will re-appear at the bottom whenever someone sends a message.\n\nLa nota adhesiva ha sido publicada en ${channel} y reaparecerá al fondo cada vez que alguien envíe un mensaje.`,
            color: 'success',
            fields: summaryFields
        })]
    });
}

async function handleRemove(interaction, client) {
    const channel = interaction.options.getChannel('channel');

    // Check invoking user has ManageMessages in the target channel
    const invokerPerms = channel.permissionsFor(interaction.member);
    if (!invokerPerms?.has('ManageMessages')) {
        return await InteractionHelper.safeEditReply(interaction, {
            embeds: [createEmbed({
                title: '❌ No Permission / Sin Permiso',
                description: `You don\'t have **Manage Messages** permission in ${channel}.\n\nNo tienes permiso de **Gestionar Mensajes** en ${channel}.`,
                color: 'error'
            })]
        });
    }

    const sticky = await getStickyNote(interaction.guild.id, channel.id);

    if (!sticky) {
        return await InteractionHelper.safeEditReply(interaction, {
            embeds: [createEmbed({
                title: '⚠️ No Sticky Note / Sin Nota Adhesiva',
                description: `There is no sticky note set in ${channel}.\n\nNo hay ninguna nota adhesiva en ${channel}.`,
                color: 'warning'
            })]
        });
    }

    // Delete the currently posted message
    if (sticky.messageId) {
        const msg = await channel.messages.fetch(sticky.messageId).catch(() => null);
        if (msg?.deletable) await msg.delete().catch(() => null);
    }

    await deleteStickyNote(interaction.guild.id, channel.id);

    logger.info(`Sticky note removed from channel ${channel.id} by ${interaction.user.id} in guild ${interaction.guild.id}`);

    return await InteractionHelper.safeEditReply(interaction, {
        embeds: [createEmbed({
            title: '🗑️ Sticky Note Removed / Nota Adhesiva Eliminada',
            description: `The sticky note in ${channel} has been removed.\n\nLa nota adhesiva en ${channel} ha sido eliminada.`,
            color: 'success'
        })]
    });
}

async function handleList(interaction, client) {
    const stickies = await listStickyNotes(interaction.guild.id);

    if (stickies.length === 0) {
        return await InteractionHelper.safeEditReply(interaction, {
            embeds: [createEmbed({
                title: '📌 Sticky Notes / Notas Adhesivas',
                description: 'There are no sticky notes set in this server.\n\nNo hay notas adhesivas en este servidor.',
                color: 'warning'
            })]
        });
    }

    const fields = stickies.map(s => ({
        name: `<#${s.channelId}>`,
        value: [
            s.embed.title ? `**${s.embed.title}**` : '*No title*',
            s.embed.description.slice(0, 80) + (s.embed.description.length > 80 ? '…' : ''),
            `*Set by <@${s.createdBy}>*`
        ].join('\n'),
        inline: false
    }));

    return await InteractionHelper.safeEditReply(interaction, {
        embeds: [createEmbed({
            title: `📌 Sticky Notes (${stickies.length}) / Notas Adhesivas`,
            description: 'All active sticky notes in this server:\n\nTodas las notas adhesivas activas en este servidor:',
            color: 'primary',
            fields: fields.slice(0, 25)
        })]
    });
}

async function handlePreview(interaction, client) {
    const channel = interaction.options.getChannel('channel');
    const sticky = await getStickyNote(interaction.guild.id, channel.id);

    if (!sticky) {
        return await InteractionHelper.safeEditReply(interaction, {
            embeds: [createEmbed({
                title: '⚠️ No Sticky Note / Sin Nota Adhesiva',
                description: `There is no sticky note set in ${channel}.\n\nNo hay ninguna nota adhesiva en ${channel}.`,
                color: 'warning'
            })]
        });
    }

    const embed = buildStickyEmbed(sticky.embed);

    return await InteractionHelper.safeEditReply(interaction, {
        embeds: [
            createEmbed({
                title: `👁️ Preview — #${channel.name}`,
                description: 'Here is how the sticky note looks:\n\nAsí es como se ve la nota adhesiva:',
                color: 'primary',
                timestamp: false
            }),
            embed
        ]
    });
}

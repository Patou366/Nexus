import { EmbedBuilder } from 'discord.js';
import { getFromDb, setInDb, deleteFromDb, db } from '../utils/database.js';
import { logger } from '../utils/logger.js';

// Re-post cooldown per channel (ms) — prevents spam when messages fly in fast
const REPOST_COOLDOWN_MS = 3000;
// Timestamp of last repost per channelId
const repostCooldowns = new Map();
// Lock set — channels currently mid-repost (prevents concurrent double-reposts)
const repostLocks = new Set();

// Prune cooldown entries older than 10× the cooldown window to avoid unbounded growth
const COOLDOWN_PRUNE_INTERVAL_MS = 60 * 1000;
setInterval(() => {
    const cutoff = Date.now() - REPOST_COOLDOWN_MS * 10;
    for (const [channelId, ts] of repostCooldowns) {
        if (ts < cutoff) repostCooldowns.delete(channelId);
    }
}, COOLDOWN_PRUNE_INTERVAL_MS).unref();

function stickyKey(guildId, channelId) {
    return `guild:${guildId}:stickynote:${channelId}`;
}

/**
 * Validate and parse a hex color string.
 * Accepts "#RRGGBB" or "RRGGBB". Falls back to Discord blurple.
 */
function parseColor(colorStr) {
    if (!colorStr) return '#5865F2';
    const hex = colorStr.startsWith('#') ? colorStr : `#${colorStr}`;
    return /^#[0-9A-Fa-f]{6}$/.test(hex) ? hex : '#5865F2';
}

/** Build a Discord EmbedBuilder from a stored embed config. */
export function buildStickyEmbed(embedConfig) {
    const embed = new EmbedBuilder().setColor(parseColor(embedConfig.color));

    if (embedConfig.title)       embed.setTitle(embedConfig.title.slice(0, 256));
    if (embedConfig.description) embed.setDescription(embedConfig.description.slice(0, 4096));
    if (embedConfig.footer)      embed.setFooter({ text: embedConfig.footer.slice(0, 2048) });
    if (embedConfig.image)       { try { embed.setImage(embedConfig.image); } catch { /* invalid URL */ } }
    if (embedConfig.thumbnail)   { try { embed.setThumbnail(embedConfig.thumbnail); } catch { /* invalid URL */ } }

    return embed;
}

/** Retrieve a sticky note config for a channel. Returns null if none. */
export async function getStickyNote(guildId, channelId) {
    return getFromDb(stickyKey(guildId, channelId), null);
}

/** Save / overwrite a sticky note config for a channel. */
export async function setStickyNote(guildId, channelId, data) {
    return setInDb(stickyKey(guildId, channelId), data);
}

/** Delete a sticky note config from the database. */
export async function deleteStickyNote(guildId, channelId) {
    return deleteFromDb(stickyKey(guildId, channelId));
}

/** List all sticky notes for a guild. Returns an array of sticky note objects. */
export async function listStickyNotes(guildId) {
    try {
        const prefix = `guild:${guildId}:stickynote:`;
        const keys = await db.list(prefix);
        if (!keys || keys.length === 0) return [];

        const results = await Promise.all(
            keys.map(key => getFromDb(key, null))
        );
        return results.filter(Boolean);
    } catch (error) {
        logger.error(`Error listing sticky notes for guild ${guildId}:`, error);
        return [];
    }
}

/**
 * Called on every new non-bot message. If the channel has a sticky note,
 * delete the old pinned copy and re-post it at the bottom.
 */
export async function handleStickyNote(message, client) {
    try {
        const { guild, channel } = message;
        if (!guild || !channel?.isTextBased()) return;

        // Per-channel cooldown — don't re-post more than once every 3 s
        const now = Date.now();
        const lastRepost = repostCooldowns.get(channel.id) ?? 0;
        if (now - lastRepost < REPOST_COOLDOWN_MS) return;

        // Mutex — skip if a repost is already in progress for this channel
        if (repostLocks.has(channel.id)) return;
        repostLocks.add(channel.id);

        // Re-check cooldown after acquiring the lock (second concurrent call may have just set it)
        const nowAfterLock = Date.now();
        const lastRepostAfterLock = repostCooldowns.get(channel.id) ?? 0;
        if (nowAfterLock - lastRepostAfterLock < REPOST_COOLDOWN_MS) {
            repostLocks.delete(channel.id);
            return;
        }

        const sticky = await getStickyNote(guild.id, channel.id);
        if (!sticky) {
            repostLocks.delete(channel.id);
            return;
        }

        repostCooldowns.set(channel.id, nowAfterLock);

        try {
            // Delete the previous sticky message if it still exists
            if (sticky.messageId) {
                const old = await channel.messages.fetch(sticky.messageId).catch(() => null);
                if (old?.deletable) await old.delete().catch(() => null);
            }

            // Re-post the sticky at the bottom
            const embed = buildStickyEmbed(sticky.embed);
            let posted = null;
            try {
                posted = await channel.send({ embeds: [embed] });
            } catch (sendErr) {
                // Missing permissions (50013) or channel deleted — auto-remove the sticky
                // to stop repeated failure loops on every future message.
                if (sendErr.code === 50013 || sendErr.code === 10003) {
                    logger.warn(`Sticky note auto-removed from ${channel.id}: bot lost send permission (${sendErr.code})`);
                    await deleteStickyNote(guild.id, channel.id).catch(() => null);
                } else {
                    logger.error(`Failed to re-post sticky note in ${channel.id}: ${sendErr.message}`);
                }
                return;
            }

            if (posted) {
                // Persist the new message ID so we can delete it next time
                await setStickyNote(guild.id, channel.id, { ...sticky, messageId: posted.id });
            }
        } finally {
            // Always release the lock so the channel can be reposted again later
            repostLocks.delete(channel.id);
        }
    } catch (error) {
        logger.error('Error in handleStickyNote:', error);
        repostLocks.delete(channel.id);
    }
}

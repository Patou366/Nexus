import { getFromDb, setInDb, deleteFromDb } from '../utils/database.js';
import { logger } from '../utils/logger.js';

const MAX_SAVES_PER_GUILD = 5;

// Channel type constants
const TYPE_TEXT         = 0;
const TYPE_VOICE        = 2;
const TYPE_CATEGORY     = 4;
const TYPE_ANNOUNCEMENT = 5;
const TYPE_STAGE        = 13;
const TYPE_FORUM        = 15;
const TYPE_MEDIA        = 16;

// ── ID / key helpers ──────────────────────────────────────────────────────────

export function generateSaveId() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

export function getServerSavesKey(guildId) {
    return `guild:${guildId}:server_backup:saves`;
}

export function getSaveKey(guildId, saveId) {
    return `guild:${guildId}:server_backup:save:${saveId}`;
}

// ── Database helpers ──────────────────────────────────────────────────────────

export async function getServerSaves(guildId) {
    const key = getServerSavesKey(guildId);
    const saves = await getFromDb(key, []);
    return Array.isArray(saves) ? saves : [];
}

export async function getServerSave(guildId, saveId) {
    const key = getSaveKey(guildId, saveId);
    return await getFromDb(key, null);
}

export async function saveServerSnapshot(guildId, snapshot) {
    const savesKey = getServerSavesKey(guildId);
    let saves = await getServerSaves(guildId);

    let overwrittenOldest = null;
    if (saves.length >= MAX_SAVES_PER_GUILD) {
        saves.sort((a, b) => a.createdAt - b.createdAt);
        overwrittenOldest = saves[0];
        await deleteFromDb(getSaveKey(guildId, overwrittenOldest.saveId));
        saves = saves.slice(1);
    }

    let saveId = generateSaveId();
    let attempts = 0;
    while (saves.some(s => s.saveId === saveId) && attempts < 10) {
        saveId = generateSaveId();
        attempts++;
    }

    const now = Date.now();
    const newSaveMeta = {
        saveId,
        createdAt: now,
        channelCount: snapshot.categories.reduce((acc, cat) => acc + cat.channels.length, 0),
        roleCount: snapshot.roles ? snapshot.roles.length : 0,
        creatorId: snapshot.creatorId
    };

    saves.push(newSaveMeta);
    await setInDb(savesKey, saves);
    await setInDb(getSaveKey(guildId, saveId), snapshot);

    logger.info(`Server snapshot saved: ${saveId} for guild ${guildId}`);

    return {
        success: true,
        saveId,
        overwritten: overwrittenOldest ? overwrittenOldest.saveId : null
    };
}

export async function deleteServerSave(guildId, saveId) {
    const savesKey = getServerSavesKey(guildId);
    let saves = await getServerSaves(guildId);

    const index = saves.findIndex(s => s.saveId === saveId);
    if (index === -1) return false;

    saves.splice(index, 1);
    await setInDb(savesKey, saves);
    await deleteFromDb(getSaveKey(guildId, saveId));

    logger.info(`Server snapshot deleted: ${saveId} for guild ${guildId}`);
    return true;
}

// ── Capture helpers ───────────────────────────────────────────────────────────

/**
 * Capture server-level settings (name, AFK, verification, etc.)
 * Note: icon/banner URLs are saved as reference only — they cannot be
 * automatically re-uploaded on restore because they require binary image data.
 */
function captureGuildSettings(guild) {
    return {
        name: guild.name,
        iconURL:  guild.iconURL({ size: 512, forceStatic: false }) || null,
        bannerURL: guild.bannerURL({ size: 1024 }) || null,
        afkChannelId: guild.afkChannelId || null,
        afkTimeout: guild.afkTimeout ?? null,
        systemChannelId: guild.systemChannelId || null,
        systemChannelFlags: guild.systemChannelFlags?.bitfield?.toString() ?? '0',
        verificationLevel: guild.verificationLevel,
        explicitContentFilter: guild.explicitContentFilter,
        defaultMessageNotifications: guild.defaultMessageNotifications,
        preferredLocale: guild.preferredLocale,
        description: guild.description || null,
        rulesChannelId: guild.rulesChannelId || null,
        publicUpdatesChannelId: guild.publicUpdatesChannelId || null,
    };
}

function capturePermissionOverwrites(channel) {
    const overwrites = [];
    for (const [id, overwrite] of channel.permissionOverwrites.cache) {
        overwrites.push({
            id,
            type: overwrite.type,
            allow: overwrite.allow.bitfield.toString(),
            deny: overwrite.deny.bitfield.toString()
        });
    }
    return overwrites;
}

function captureChannelData(channel) {
    const data = {
        id: channel.id,
        name: channel.name,
        type: channel.type,
        position: channel.position,
        permissionOverwrites: capturePermissionOverwrites(channel)
    };

    // Text + Announcement channels
    if (channel.type === TYPE_TEXT || channel.type === TYPE_ANNOUNCEMENT) {
        data.topic = channel.topic || null;
        data.nsfw = channel.nsfw || false;
        data.rateLimitPerUser = channel.rateLimitPerUser || 0;
        data.defaultAutoArchiveDuration = channel.defaultAutoArchiveDuration || null;
    }

    // Forum + Media channels
    if (channel.type === TYPE_FORUM || channel.type === TYPE_MEDIA) {
        data.topic = channel.topic || null;
        data.nsfw = channel.nsfw || false;
        data.rateLimitPerUser = channel.rateLimitPerUser || 0;
        data.defaultAutoArchiveDuration = channel.defaultAutoArchiveDuration || null;
        data.defaultThreadRateLimitPerUser = channel.defaultThreadRateLimitPerUser || 0;
        data.defaultSortOrder = channel.defaultSortOrder ?? null;
        data.defaultForumLayout = channel.defaultForumLayout ?? 0;
        data.availableTags = (channel.availableTags ?? []).map(t => ({
            name: t.name,
            moderated: t.moderated || false,
            emoji: t.emoji ? { id: t.emoji.id || null, name: t.emoji.name || null } : null
        }));
        data.defaultReactionEmoji = channel.defaultReactionEmoji
            ? { id: channel.defaultReactionEmoji.id || null, name: channel.defaultReactionEmoji.name || null }
            : null;
    }

    // Voice + Stage channels
    if (channel.type === TYPE_VOICE || channel.type === TYPE_STAGE) {
        data.bitrate = channel.bitrate || null;
        data.userLimit = channel.userLimit || 0;
        data.rtcRegion = channel.rtcRegion || null;
    }

    return data;
}

function captureRoles(guild) {
    const roles = [];
    const sortedRoles = guild.roles.cache
        .filter(role => role.id !== guild.id)
        .sort((a, b) => b.position - a.position);

    for (const role of sortedRoles.values()) {
        roles.push({
            id: role.id,
            name: role.name,
            color: role.color,
            hoist: role.hoist,
            position: role.position,
            permissions: role.permissions.bitfield.toString(),
            mentionable: role.mentionable,
            managed: role.managed,
            icon: role.icon || null,
            unicodeEmoji: role.unicodeEmoji || null
        });
    }

    return roles;
}

/**
 * Capture the full server layout — structure, permissions, and server settings.
 */
export function captureServerLayout(guild, creatorId) {
    const categories = [];

    const guildCategories = guild.channels.cache
        .filter(ch => ch.type === TYPE_CATEGORY)
        .sort((a, b) => a.position - b.position);

    for (const category of guildCategories.values()) {
        const categoryData = {
            id: category.id,
            name: category.name,
            position: category.position,
            permissionOverwrites: capturePermissionOverwrites(category),
            channels: []
        };

        const channelsInCategory = guild.channels.cache
            .filter(ch => ch.parentId === category.id)
            .sort((a, b) => a.position - b.position);

        for (const channel of channelsInCategory.values()) {
            categoryData.channels.push(captureChannelData(channel));
        }

        categories.push(categoryData);
    }

    // Channels with no category
    const uncategorized = guild.channels.cache
        .filter(ch => !ch.parentId && ch.type !== TYPE_CATEGORY)
        .sort((a, b) => a.position - b.position);

    if (uncategorized.size > 0) {
        const bucket = { id: null, name: 'Uncategorized', position: -1, permissionOverwrites: [], channels: [] };
        for (const channel of uncategorized.values()) {
            bucket.channels.push(captureChannelData(channel));
        }
        categories.push(bucket);
    }

    return {
        guildId: guild.id,
        guildName: guild.name,
        creatorId,
        createdAt: Date.now(),
        guildSettings: captureGuildSettings(guild),
        categories,
        roles: captureRoles(guild)
    };
}

// ── Restore helpers ───────────────────────────────────────────────────────────

/**
 * Restore server-level settings. Channel IDs are remapped via channelIdMap
 * in case any channels were recreated during restore with a new ID.
 */
async function restoreGuildSettings(guild, settings, channelIdMap) {
    if (!settings) return false;

    try {
        const mapId = (savedId) => savedId ? (channelIdMap[savedId] || savedId) : null;

        const updates = {};

        if (settings.verificationLevel != null)          updates.verificationLevel = settings.verificationLevel;
        if (settings.explicitContentFilter != null)       updates.explicitContentFilter = settings.explicitContentFilter;
        if (settings.defaultMessageNotifications != null) updates.defaultMessageNotifications = settings.defaultMessageNotifications;
        if (settings.preferredLocale)                     updates.preferredLocale = settings.preferredLocale;
        if (settings.afkTimeout != null)                  updates.afkTimeout = settings.afkTimeout;
        if (settings.description != null)                 updates.description = settings.description;

        // Channel-referencing settings — verify channel still exists before setting
        const afkId = mapId(settings.afkChannelId);
        if (afkId && guild.channels.cache.has(afkId)) {
            updates.afkChannel = afkId;
        }

        const systemId = mapId(settings.systemChannelId);
        if (systemId && guild.channels.cache.has(systemId)) {
            updates.systemChannel = systemId;
            if (settings.systemChannelFlags != null) {
                updates.systemChannelFlags = BigInt(settings.systemChannelFlags);
            }
        }

        const rulesId = mapId(settings.rulesChannelId);
        if (rulesId && guild.channels.cache.has(rulesId)) {
            updates.rulesChannel = rulesId;
        }

        const pubId = mapId(settings.publicUpdatesChannelId);
        if (pubId && guild.channels.cache.has(pubId)) {
            updates.publicUpdatesChannel = pubId;
        }

        if (Object.keys(updates).length === 0) return false;

        await guild.edit(updates);
        logger.info(`Guild settings restored for ${guild.id}`);
        return true;
    } catch (error) {
        logger.warn('Could not fully restore guild settings:', error.message);
        return false;
    }
}

/**
 * Build Discord.js permission overwrites array for channel create/edit.
 */
function buildPermissionOverwrites(overwritesData, guild, roleMapping) {
    if (!overwritesData || overwritesData.length === 0) return undefined;

    const overwrites = [];
    for (const ow of overwritesData) {
        let targetId = ow.id;
        if (ow.type === 0) {
            // Role overwrite — remap ID if role was recreated
            const role = guild.roles.cache.get(ow.id) || guild.roles.cache.get(roleMapping[ow.id]);
            if (!role) continue;
            targetId = role.id;
        } else if (ow.type === 1) {
            // Member overwrite — skip if they're no longer in the server
            if (!guild.members.cache.has(ow.id)) continue;
            targetId = ow.id;
        }

        overwrites.push({
            id: targetId,
            type: Number(ow.type),
            allow: BigInt(ow.allow),
            deny: BigInt(ow.deny)
        });
    }

    return overwrites.length > 0 ? overwrites : undefined;
}

/**
 * Build channel create/edit options from saved channel data.
 * isCreate=true includes type and parent; false omits them (can't change type on edit).
 */
function buildChannelOptions(channelData, parent, guild, roleMapping, isCreate) {
    const opts = {
        name: channelData.name,
        position: channelData.position,
        permissionOverwrites: buildPermissionOverwrites(channelData.permissionOverwrites, guild, roleMapping)
    };

    if (isCreate) {
        opts.type = channelData.type;
        if (parent) opts.parent = parent;
    } else {
        // On edit, allow moving channel back to its saved category (or uncategorized)
        opts.parent = parent ?? null;
    }

    const t = channelData.type;

    // Text + Announcement
    if (t === TYPE_TEXT || t === TYPE_ANNOUNCEMENT) {
        if (channelData.topic !== undefined)                   opts.topic = channelData.topic || null;
        if (channelData.nsfw !== undefined)                    opts.nsfw = channelData.nsfw;
        if (channelData.rateLimitPerUser !== undefined)        opts.rateLimitPerUser = channelData.rateLimitPerUser;
        if (channelData.defaultAutoArchiveDuration)            opts.defaultAutoArchiveDuration = channelData.defaultAutoArchiveDuration;
    }

    // Forum + Media
    if (t === TYPE_FORUM || t === TYPE_MEDIA) {
        if (channelData.topic !== undefined)                          opts.topic = channelData.topic || null;
        if (channelData.nsfw !== undefined)                           opts.nsfw = channelData.nsfw;
        if (channelData.rateLimitPerUser !== undefined)               opts.rateLimitPerUser = channelData.rateLimitPerUser;
        if (channelData.defaultAutoArchiveDuration)                   opts.defaultAutoArchiveDuration = channelData.defaultAutoArchiveDuration;
        if (channelData.defaultThreadRateLimitPerUser !== undefined)  opts.defaultThreadRateLimitPerUser = channelData.defaultThreadRateLimitPerUser;
        if (channelData.defaultSortOrder != null)                     opts.defaultSortOrder = channelData.defaultSortOrder;
        if (channelData.defaultForumLayout !== undefined)             opts.defaultForumLayout = channelData.defaultForumLayout;
        // Always set these — even when empty/null — so restore clears stale values
        opts.availableTags = (channelData.availableTags ?? []).map(tag => ({
            name: tag.name,
            moderated: tag.moderated || false,
            ...(tag.emoji ? { emoji: tag.emoji } : {})
        }));
        opts.defaultReactionEmoji = channelData.defaultReactionEmoji ?? null;
    }

    // Voice + Stage
    if (t === TYPE_VOICE || t === TYPE_STAGE) {
        if (channelData.bitrate)                        opts.bitrate = channelData.bitrate;
        if (channelData.userLimit !== undefined)        opts.userLimit = channelData.userLimit;
        if (channelData.rtcRegion !== undefined)        opts.rtcRegion = channelData.rtcRegion || null;
    }

    return opts;
}

/**
 * Create a channel if it doesn't exist, or update it if it does.
 * Tracks old-ID → current-ID in channelIdMap for guild settings remapping.
 */
async function createOrUpdateChannel(guild, parent, channelData, roleMapping, results, channelIdMap) {
    // Match by saved Discord ID first (most reliable)
    let existing = guild.channels.cache.get(channelData.id);

    // Fall back: same name, same parent, same type
    if (!existing) {
        existing = guild.channels.cache.find(
            ch => ch.type === channelData.type &&
                  ch.parentId === (parent?.id ?? null) &&
                  ch.name.toLowerCase() === channelData.name.toLowerCase()
        );
    }

    if (existing) {
        channelIdMap[channelData.id] = existing.id;
        try {
            const editOpts = buildChannelOptions(channelData, parent, guild, roleMapping, false);
            await existing.edit(editOpts);
            results.channelsUpdated++;
        } catch (err) {
            logger.debug(`Could not update channel ${channelData.name}: ${err.message}`);
            results.errors.push(`Could not update channel ${channelData.name}: ${err.message}`);
        }
        return existing;
    }

    // Create new
    try {
        const createOpts = buildChannelOptions(channelData, parent, guild, roleMapping, true);
        const newCh = await guild.channels.create(createOpts);
        channelIdMap[channelData.id] = newCh.id;
        results.channelsCreated++;
        logger.info(`Created channel: ${channelData.name}`);
        return newCh;
    } catch (error) {
        results.errors.push(`Failed to create channel ${channelData.name}: ${error.message}`);
        return null;
    }
}

// ── Public restore API ────────────────────────────────────────────────────────

/**
 * Restore roles from a snapshot. Updates existing roles, creates missing ones.
 */
export async function restoreRolesFromSnapshot(guild, rolesData) {
    const results = {
        rolesCreated: 0,
        rolesUpdated: 0,
        roleMapping: {},
        errors: []
    };

    if (!rolesData || rolesData.length === 0) return results;

    // Restore lowest → highest so positions settle correctly
    const sorted = [...rolesData]
        .filter(r => !r.managed)
        .sort((a, b) => a.position - b.position);

    for (const roleData of sorted) {
        let existing = guild.roles.cache.get(roleData.id)
            || guild.roles.cache.find(r => r.name === roleData.name && r.id !== guild.id);

        if (existing) {
            results.roleMapping[roleData.id] = existing.id;
            try {
                await existing.edit({
                    name: roleData.name,
                    color: roleData.color,
                    hoist: roleData.hoist,
                    permissions: BigInt(roleData.permissions),
                    mentionable: roleData.mentionable,
                });
                results.rolesUpdated++;
            } catch (err) {
                // Role might be above the bot's own role — non-fatal
                logger.debug(`Could not update role ${roleData.name}: ${err.message}`);
            }
            continue;
        }

        try {
            const newRole = await guild.roles.create({
                name: roleData.name,
                color: roleData.color,
                hoist: roleData.hoist,
                permissions: BigInt(roleData.permissions),
                mentionable: roleData.mentionable,
                reason: 'Server backup restoration'
            });
            results.roleMapping[roleData.id] = newRole.id;
            results.rolesCreated++;
            logger.info(`Created role: ${roleData.name}`);
        } catch (error) {
            results.errors.push(`Failed to create role ${roleData.name}: ${error.message}`);
        }
    }

    return results;
}

/**
 * Full server restore from snapshot.
 * Order: roles → categories + channels → guild settings.
 */
export async function restoreServerFromSnapshot(guild, snapshot, roleMapping = {}) {
    const results = {
        rolesCreated: 0,
        rolesUpdated: 0,
        categoriesCreated: 0,
        categoriesUpdated: 0,
        channelsCreated: 0,
        channelsUpdated: 0,
        settingsRestored: false,
        errors: []
    };

    // channelIdMap: savedChannelId → currentChannelId
    // Used to remap afkChannel, systemChannel etc. in guild settings
    const channelIdMap = {};

    // 1. Roles first — channel permission overwrites reference role IDs
    if (snapshot.roles?.length > 0) {
        const roleRes = await restoreRolesFromSnapshot(guild, snapshot.roles);
        results.rolesCreated = roleRes.rolesCreated;
        results.rolesUpdated = roleRes.rolesUpdated;
        results.errors.push(...roleRes.errors);
        roleMapping = { ...roleMapping, ...roleRes.roleMapping };
    }

    // 2. Categories and their channels
    for (const categoryData of snapshot.categories) {
        // Uncategorized bucket
        if (categoryData.id === null) {
            for (const ch of categoryData.channels) {
                await createOrUpdateChannel(guild, null, ch, roleMapping, results, channelIdMap);
            }
            continue;
        }

        // Find or create / update category
        let category = guild.channels.cache.get(categoryData.id)
            || guild.channels.cache.find(
                ch => ch.type === TYPE_CATEGORY &&
                      ch.name.toLowerCase() === categoryData.name.toLowerCase()
            );

        if (category) {
            channelIdMap[categoryData.id] = category.id;
            try {
                await category.edit({
                    name: categoryData.name,
                    position: categoryData.position >= 0 ? categoryData.position : undefined,
                    permissionOverwrites: buildPermissionOverwrites(categoryData.permissionOverwrites, guild, roleMapping)
                });
                results.categoriesUpdated++;
            } catch (err) {
                logger.debug(`Could not update category ${categoryData.name}: ${err.message}`);
            }
        } else {
            try {
                category = await guild.channels.create({
                    name: categoryData.name,
                    type: TYPE_CATEGORY,
                    position: categoryData.position >= 0 ? categoryData.position : undefined,
                    permissionOverwrites: buildPermissionOverwrites(categoryData.permissionOverwrites, guild, roleMapping),
                    reason: 'Server backup restoration'
                });
                channelIdMap[categoryData.id] = category.id;
                results.categoriesCreated++;
                logger.info(`Created category: ${categoryData.name}`);
            } catch (error) {
                results.errors.push(`Failed to create category ${categoryData.name}: ${error.message}`);
                continue;
            }
        }

        // Channels inside this category
        for (const ch of categoryData.channels) {
            await createOrUpdateChannel(guild, category, ch, roleMapping, results, channelIdMap);
        }
    }

    // 3. Guild settings last — needs channel IDs fully resolved
    if (snapshot.guildSettings) {
        results.settingsRestored = await restoreGuildSettings(guild, snapshot.guildSettings, channelIdMap);
    }

    logger.info(`Server restoration complete for guild ${guild.id}`, results);
    return results;
}

export { MAX_SAVES_PER_GUILD };

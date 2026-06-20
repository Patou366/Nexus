import { getFromDb, setInDb, deleteFromDb } from '../utils/database.js';
import { logger } from '../utils/logger.js';

const MAX_SAVES_PER_GUILD = 5;

/**
 * Generate a unique 6-character save ID
 * @returns {string} A random 6-character alphanumeric ID
 */
export function generateSaveId() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

/**
 * Get the database key for a guild's server saves list
 * @param {string} guildId - The guild ID
 * @returns {string} The database key
 */
export function getServerSavesKey(guildId) {
    return `guild:${guildId}:server_backup:saves`;
}

/**
 * Get the database key for a specific save
 * @param {string} guildId - The guild ID
 * @param {string} saveId - The save ID
 * @returns {string} The database key
 */
export function getSaveKey(guildId, saveId) {
    return `guild:${guildId}:server_backup:save:${saveId}`;
}

/**
 * Get all saves for a guild
 * @param {string} guildId - The guild ID
 * @returns {Promise<Array>} Array of save metadata
 */
export async function getServerSaves(guildId) {
    const key = getServerSavesKey(guildId);
    const saves = await getFromDb(key, []);
    return Array.isArray(saves) ? saves : [];
}

/**
 * Get a specific save by ID
 * @param {string} guildId - The guild ID
 * @param {string} saveId - The save ID
 * @returns {Promise<Object|null>} The save data or null
 */
export async function getServerSave(guildId, saveId) {
    const key = getSaveKey(guildId, saveId);
    return await getFromDb(key, null);
}

/**
 * Save a server snapshot
 * @param {string} guildId - The guild ID
 * @param {Object} snapshot - The snapshot data
 * @returns {Promise<Object>} Result with saveId and status
 */
export async function saveServerSnapshot(guildId, snapshot) {
    const savesKey = getServerSavesKey(guildId);
    let saves = await getServerSaves(guildId);

    // Check if we need to remove the oldest save
    let overwrittenOldest = null;
    if (saves.length >= MAX_SAVES_PER_GUILD) {
        // Sort by creation date and remove oldest
        saves.sort((a, b) => a.createdAt - b.createdAt);
        overwrittenOldest = saves[0];

        // Delete the oldest save data
        await deleteFromDb(getSaveKey(guildId, overwrittenOldest.saveId));

        // Remove from the list
        saves = saves.slice(1);
    }

    // Generate a unique save ID
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

    // Save the metadata to the list
    saves.push(newSaveMeta);
    await setInDb(savesKey, saves);

    // Save the actual snapshot data
    const saveKey = getSaveKey(guildId, saveId);
    await setInDb(saveKey, snapshot);

    logger.info(`Server snapshot saved: ${saveId} for guild ${guildId}`);

    return {
        success: true,
        saveId,
        overwritten: overwrittenOldest ? overwrittenOldest.saveId : null
    };
}

/**
 * Delete a server snapshot
 * @param {string} guildId - The guild ID
 * @param {string} saveId - The save ID
 * @returns {Promise<boolean>} Success status
 */
export async function deleteServerSave(guildId, saveId) {
    const savesKey = getServerSavesKey(guildId);
    let saves = await getServerSaves(guildId);

    const index = saves.findIndex(s => s.saveId === saveId);
    if (index === -1) {
        return false;
    }

    // Remove from list
    saves.splice(index, 1);
    await setInDb(savesKey, saves);

    // Delete the save data
    await deleteFromDb(getSaveKey(guildId, saveId));

    logger.info(`Server snapshot deleted: ${saveId} for guild ${guildId}`);
    return true;
}

/**
 * Capture the current server layout
 * @param {Object} guild - The Discord guild object
 * @param {string} creatorId - The user ID who created the backup
 * @returns {Object} The captured snapshot
 */
export function captureServerLayout(guild, creatorId) {
    const categories = [];

    // Get all categories with their channels
    const guildCategories = guild.channels.cache
        .filter(ch => ch.type === 4) // ChannelType.GuildCategory
        .sort((a, b) => a.position - b.position);

    for (const category of guildCategories.values()) {
        const categoryData = {
            id: category.id,
            name: category.name,
            position: category.position,
            permissionOverwrites: capturePermissionOverwrites(category),
            channels: []
        };

        // Get channels in this category
        const channelsInCategory = guild.channels.cache
            .filter(ch => ch.parentId === category.id)
            .sort((a, b) => a.position - b.position);

        for (const channel of channelsInCategory.values()) {
            categoryData.channels.push({
                id: channel.id,
                name: channel.name,
                type: channel.type, // 0 = text, 2 = voice, etc.
                position: channel.position,
                topic: channel.topic || null,
                nsfw: channel.nsfw || false,
                bitrate: channel.bitrate || null,
                userLimit: channel.userLimit || null,
                rtcRegion: channel.rtcRegion || null,
                permissionOverwrites: capturePermissionOverwrites(channel)
            });
        }

        categories.push(categoryData);
    }

    // Get channels without a category (they will be recreated at the top)
    const uncategorizedChannels = guild.channels.cache
        .filter(ch => !ch.parentId && ch.type !== 4) // Not a category and no parent
        .sort((a, b) => a.position - b.position);

    if (uncategorizedChannels.size > 0) {
        const uncategorizedCategory = {
            id: null,
            name: 'Uncategorized',
            position: -1,
            permissionOverwrites: [],
            channels: []
        };

        for (const channel of uncategorizedChannels.values()) {
            uncategorizedCategory.channels.push({
                id: channel.id,
                name: channel.name,
                type: channel.type,
                position: channel.position,
                topic: channel.topic || null,
                nsfw: channel.nsfw || false,
                bitrate: channel.bitrate || null,
                userLimit: channel.userLimit || null,
                rtcRegion: channel.rtcRegion || null,
                permissionOverwrites: capturePermissionOverwrites(channel)
            });
        }

        categories.push(uncategorizedCategory);
    }

    // Capture server roles
    const roles = captureRoles(guild);

    return {
        guildId: guild.id,
        guildName: guild.name,
        creatorId,
        createdAt: Date.now(),
        categories,
        roles
    };
}

/**
 * Capture all server roles with their permissions and settings
 * @param {Object} guild - The Discord guild
 * @returns {Array} Array of role data
 */
function captureRoles(guild) {
    const roles = [];

    // Sort roles by position (highest first) - skip @everyone (position 0, id === guild.id)
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
 * Capture permission overwrites for a channel
 * @param {Object} channel - The Discord channel
 * @returns {Array} Array of permission overwrites
 */
function capturePermissionOverwrites(channel) {
    const overwrites = [];

    for (const [id, overwrite] of channel.permissionOverwrites.cache) {
        overwrites.push({
            id,
            type: overwrite.type, // 0 = role, 1 = member
            allow: overwrite.allow.bitfield.toString(),
            deny: overwrite.deny.bitfield.toString()
        });
    }

    return overwrites;
}

/**
 * Restore missing roles from a snapshot
 * @param {Object} guild - The Discord guild
 * @param {Array} rolesData - Array of role data from the snapshot
 * @returns {Promise<Object>} Results with rolesCreated count, roleMapping, and errors
 */
export async function restoreRolesFromSnapshot(guild, rolesData) {
    const results = {
        rolesCreated: 0,
        roleMapping: {},
        errors: []
    };

    if (!rolesData || rolesData.length === 0) {
        return results;
    }

    // Process roles from lowest position to highest so positions are correct
    const sortedRoles = [...rolesData]
        .filter(r => !r.managed) // Skip managed roles (bot roles, integrations)
        .sort((a, b) => a.position - b.position);

    for (const roleData of sortedRoles) {
        // Check if role already exists (by ID or by name)
        let existingRole = guild.roles.cache.get(roleData.id);
        if (existingRole) {
            results.roleMapping[roleData.id] = existingRole.id;
            continue;
        }

        // Try to find by exact name
        existingRole = guild.roles.cache.find(
            r => r.name === roleData.name && r.id !== guild.id
        );
        if (existingRole) {
            results.roleMapping[roleData.id] = existingRole.id;
            continue;
        }

        // Create the role
        try {
            const newRole = await guild.roles.create({
                name: roleData.name,
                color: roleData.color,
                hoist: roleData.hoist,
                permissions: BigInt(roleData.permissions),
                mentionable: roleData.mentionable,
                reason: 'Server backup restoration / Restauracion de copia de seguridad'
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
 * Restore missing channels from a snapshot
 * @param {Object} guild - The Discord guild
 * @param {Object} snapshot - The snapshot data
 * @param {Object} roleMapping - Mapping of old role IDs to new role IDs (if roles changed)
 * @returns {Promise<Object>} Results of the restoration
 */
export async function restoreServerFromSnapshot(guild, snapshot, roleMapping = {}) {
    const results = {
        rolesCreated: 0,
        categoriesCreated: 0,
        channelsCreated: 0,
        errors: []
    };

    // Restore roles first (channels need role IDs for permission overwrites)
    if (snapshot.roles && snapshot.roles.length > 0) {
        const roleResults = await restoreRolesFromSnapshot(guild, snapshot.roles);
        results.rolesCreated = roleResults.rolesCreated;
        results.errors.push(...roleResults.errors);
        // Merge role mappings
        roleMapping = { ...roleMapping, ...roleResults.roleMapping };
    }

    // Build a map of current channels by name for quick lookup
    const currentChannels = new Map();
    for (const channel of guild.channels.cache.values()) {
        currentChannels.set(channel.name.toLowerCase(), channel);
    }

    // Process categories first
    for (const categoryData of snapshot.categories) {
        if (categoryData.id === null) {
            // Uncategorized - just create channels
            for (const channelData of categoryData.channels) {
                await createChannelIfNeeded(guild, null, channelData, currentChannels, roleMapping, results);
            }
            continue;
        }

        // Check if category exists
        let category = guild.channels.cache.get(categoryData.id);
        if (!category) {
            // Try to find by name
            category = guild.channels.cache.find(
                ch => ch.type === 4 && ch.name.toLowerCase() === categoryData.name.toLowerCase()
            );
        }

        if (!category) {
            // Create the category
            try {
                category = await guild.channels.create({
                    name: categoryData.name,
                    type: 4, // Category
                    position: categoryData.position >= 0 ? categoryData.position : undefined,
                    permissionOverwrites: buildPermissionOverwrites(categoryData.permissionOverwrites, guild, roleMapping)
                });
                results.categoriesCreated++;
                logger.info(`Created category: ${categoryData.name}`);
            } catch (error) {
                results.errors.push(`Failed to create category ${categoryData.name}: ${error.message}`);
                continue;
            }
        }

        // Process channels in this category
        for (const channelData of categoryData.channels) {
            await createChannelIfNeeded(guild, category, channelData, currentChannels, roleMapping, results);
        }
    }

    logger.info(`Server restoration complete for guild ${guild.id}`, results);
    return results;
}

/**
 * Create a channel if it doesn't exist
 */
async function createChannelIfNeeded(guild, parent, channelData, currentChannels, roleMapping, results) {
    // Check if channel already exists (by ID or name in the same parent)
    const existingById = guild.channels.cache.get(channelData.id);
    if (existingById) {
        return; // Channel exists
    }

    // Check by name in the same parent
    const existingByName = guild.channels.cache.find(
        ch => ch.parentId === (parent?.id || null) &&
              ch.name.toLowerCase() === channelData.name.toLowerCase()
    );
    if (existingByName) {
        return; // Channel exists with same name
    }

    // Create the channel
    try {
        const createOptions = {
            name: channelData.name,
            type: channelData.type,
            parent: parent,
            topic: channelData.topic || undefined,
            nsfw: channelData.nsfw || false,
            permissionOverwrites: buildPermissionOverwrites(channelData.permissionOverwrites, guild, roleMapping)
        };

        // Voice channel specific options
        if (channelData.type === 2) { // Voice
            createOptions.bitrate = channelData.bitrate || undefined;
            createOptions.userLimit = channelData.userLimit || 0;
            if (channelData.rtcRegion) {
                createOptions.rtcRegion = channelData.rtcRegion;
            }
        }

        await guild.channels.create(createOptions);
        results.channelsCreated++;
        logger.info(`Created channel: ${channelData.name}`);
    } catch (error) {
        results.errors.push(`Failed to create channel ${channelData.name}: ${error.message}`);
    }
}

/**
 * Build permission overwrites array for channel creation
 */
function buildPermissionOverwrites(overwritesData, guild, roleMapping) {
    if (!overwritesData || overwritesData.length === 0) {
        return undefined;
    }

    const overwrites = [];
    for (const ow of overwritesData) {
        // Map old role IDs to new ones if needed
        let targetId = ow.id;
        if (ow.type === 0) { // Role
            const role = guild.roles.cache.get(ow.id) || guild.roles.cache.get(roleMapping[ow.id]);
            if (!role) continue; // Skip if role doesn't exist
            targetId = role.id;
        } else if (ow.type === 1) { // Member
            // Members might not be in the server anymore
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

export { MAX_SAVES_PER_GUILD };

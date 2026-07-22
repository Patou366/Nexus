import { AuditLogEvent, PermissionsBitField } from 'discord.js';
import { logger } from '../utils/logger.js';
import { getColor } from '../config/bot.js';
import { logEvent } from '../utils/moderation.js';

// ─── DB ──────────────────────────────────────────────────────────────────────
const DB_KEY = (guildId) => `guild:${guildId}:permguard:users`;

/** @returns {Promise<Record<string, true>>} map of userId → true */
async function getData(client, guildId) {
    try {
        return (await client.db.get(DB_KEY(guildId))) || {};
    } catch {
        return {};
    }
}

/** Check whether a user is in the allowed list */
export async function isUserAllowed(client, guildId, userId) {
    const data = await getData(client, guildId);
    return data[userId] === true;
}

/** Add a user to the allowed list. Returns true on success. */
export async function addPermUser(client, guildId, userId) {
    try {
        const data = await getData(client, guildId);
        data[userId] = true;
        await client.db.set(DB_KEY(guildId), data);
        return true;
    } catch (err) {
        logger.error(`[PermGuard] addPermUser error for ${userId} in ${guildId}:`, err);
        return false;
    }
}

/** Remove a user from the allowed list. Returns true on success. */
export async function removePermUser(client, guildId, userId) {
    try {
        const data = await getData(client, guildId);
        if (!data[userId]) return true; // already gone
        delete data[userId];
        await client.db.set(DB_KEY(guildId), data);
        return true;
    } catch (err) {
        logger.error(`[PermGuard] removePermUser error for ${userId} in ${guildId}:`, err);
        return false;
    }
}

/** Return an array of user IDs in the allowed list */
export async function listPermUsers(client, guildId) {
    const data = await getData(client, guildId);
    return Object.keys(data);
}

// ─── Audit log helper ────────────────────────────────────────────────────────
/**
 * Fetch the executor ID from the audit log for the most recent entry
 * of `auditType` targeting `targetId`, within a 5-second freshness window.
 * Returns null if the entry can't be found or ViewAuditLog is missing.
 */
async function getAuditExecutor(guild, auditType, targetId) {
    try {
        const me = guild.members.me;
        if (!me?.permissions.has(PermissionsBitField.Flags.ViewAuditLog)) return null;

        const logs = await guild.fetchAuditLogs({ type: auditType, limit: 5 });
        const entry = logs.entries.find(
            (e) => e.target?.id === targetId && Date.now() - e.createdTimestamp < 5000
        );
        return entry?.executor?.id ?? null;
    } catch (err) {
        logger.debug(`[PermGuard] Could not fetch audit logs (${AuditLogEvent[auditType]}):`, err.message);
        return null;
    }
}

// ─── Violation handler ───────────────────────────────────────────────────────
async function handleViolation(guild, client, executorId, actionLabel) {
    try {
        const member = await guild.members.fetch(executorId).catch(() => null);
        if (!member) return;

        const user = member.user;
        const reason = `Perm Guard: ${actionLabel} without permission`;

        let kicked = false;
        if (member.kickable) {
            try {
                await member.kick(reason);
                kicked = true;
                logger.warn(`[PermGuard] Kicked ${user.tag} (${executorId}) in guild ${guild.name} — ${reason}`);
            } catch (err) {
                logger.warn(`[PermGuard] Could not kick ${executorId} in ${guild.id}: ${err.message}`);
            }
        } else {
            logger.warn(`[PermGuard] Member ${executorId} is not kickable in guild ${guild.id}`);
        }

        await logEvent({
            client,
            guild,
            event: {
                action: 'Perm Guard Kick',
                target: `${user.tag} (${user.id})`,
                executor: `${client.user.tag} (${client.user.id})`,
                reason: kicked
                    ? reason
                    : `${reason} — kick failed (insufficient role hierarchy or missing permission)`,
                color: getColor('error'),
                metadata: {
                    userId: executorId,
                    action: actionLabel,
                    kicked: kicked ? 'Yes' : 'No',
                },
            },
        });
    } catch (err) {
        logger.error(`[PermGuard] handleViolation error for ${executorId} in ${guild.id}:`, err);
    }
}

// ─── Main check ──────────────────────────────────────────────────────────────
/**
 * Core perm-guard check called from event handlers.
 *
 * @param {import('discord.js').Guild}  guild
 * @param {import('discord.js').Client} client
 * @param {number}                      auditType    - AuditLogEvent value
 * @param {string}                      targetId     - ID of the deleted/updated resource
 * @param {string}                      actionLabel  - Human-readable description, e.g. 'deleted a channel'
 */
export async function checkPermGuard(guild, client, auditType, targetId, actionLabel) {
    if (!guild || !client?.db) return;

    const executorId = await getAuditExecutor(guild, auditType, targetId);
    if (!executorId) return;

    // Never act on the bot itself or the server owner
    if (executorId === client.user.id) return;
    if (executorId === guild.ownerId) return;

    // Fetch the member to check their permissions
    const member = await guild.members.fetch(executorId).catch(() => null);
    if (!member) return;

    // Admins and bots are always exempt
    if (member.permissions.has(PermissionsBitField.Flags.Administrator)) return;
    if (member.user.bot) return;

    // Check the allow-list
    const allowed = await isUserAllowed(client, guild.id, executorId);
    if (allowed) return;

    // Not allowed — kick and log
    await handleViolation(guild, client, executorId, actionLabel);
}

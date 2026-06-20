import { logger } from './logger.js';
import { successEmbed, warningEmbed } from './embeds.js';

/**
 * Parses a string of user IDs/mentions into an array of snowflake IDs.
 * Strips mention formatting, splits on whitespace/commas, limits to 20.
 * @param {string} input - Raw user input string
 * @returns {string[]} Array of valid Discord snowflake IDs
 */
export function parseUserIds(input) {
    return input
        .replace(/<@!?(\d+)>/g, '$1')
        .split(/[\s,]+/)
        .filter(id => id && /^\d+$/.test(id))
        .slice(0, 20);
}

/**
 * Creates a fresh results tracker for mass actions.
 * @returns {{ successful: Array, failed: Array, skipped: Array }}
 */
export function createMassActionResults() {
    return {
        successful: [],
        failed: [],
        skipped: []
    };
}

/**
 * Checks whether a target can be acted upon by the invoking member,
 * considering role hierarchy and guild ownership.
 * @param {import('discord.js').GuildMember} targetMember
 * @param {import('discord.js').CommandInteraction} interaction
 * @returns {{ allowed: boolean, reason?: string }}
 */
export function checkMassActionHierarchy(targetMember, interaction) {
    if (
        targetMember.roles.highest.position >= interaction.member.roles.highest.position &&
        interaction.guild.ownerId !== interaction.user.id
    ) {
        return {
            allowed: false,
            reason: `Cannot act on user with equal or higher role`
        };
    }
    return { allowed: true };
}

/**
 * Formats the results of a mass action into a Discord-ready description string.
 * @param {{ successful: Array, failed: Array, skipped: Array }} results
 * @param {string} actionVerb - Past-tense verb, e.g. "Banned", "Kicked"
 * @returns {string}
 */
export function formatMassActionResults(results, actionVerb) {
    let description = `**Mass ${actionVerb} Results:**\n\n`;

    if (results.successful.length > 0) {
        description += `\u2705 **Successfully ${actionVerb} (${results.successful.length}):**\n`;
        for (const result of results.successful) {
            description += `\u2022 ${result.user} (${result.userId})\n`;
        }
        description += '\n';
    }

    if (results.skipped.length > 0) {
        description += `\u26a0\ufe0f **Skipped (${results.skipped.length}):**\n`;
        for (const result of results.skipped) {
            description += `\u2022 ${result.user} - ${result.reason}\n`;
        }
        description += '\n';
    }

    if (results.failed.length > 0) {
        description += `\u274c **Failed (${results.failed.length}):**\n`;
        for (const result of results.failed) {
            description += `\u2022 ${result.userId} - ${result.reason}\n`;
        }
    }

    return description;
}

/**
 * Selects the appropriate embed function based on whether any actions succeeded.
 * @param {{ successful: Array }} results
 * @returns {Function} successEmbed or warningEmbed
 */
export function getMassActionEmbed(results) {
    return results.successful.length > 0 ? successEmbed : warningEmbed;
}

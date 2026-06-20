import { PermissionFlagsBits, MessageFlags } from 'discord.js';
import { InteractionHelper } from './interactionHelper.js';
import { logger } from './logger.js';
import { TitanBotError, ErrorTypes } from './errorHandler.js';
import { errorEmbed, warningEmbed } from './embeds.js';
import { checkRateLimit } from './rateLimiter.js';

/**
 * Safely defers an interaction and logs a warning on failure.
 * @returns {Promise<boolean>} true if defer succeeded, false otherwise
 */
export async function guardDefer(interaction, commandName, options = {}) {
    const deferSuccess = await InteractionHelper.safeDefer(interaction, options);
    if (!deferSuccess) {
        logger.warn(`${commandName} interaction defer failed`, {
            userId: interaction.user.id,
            guildId: interaction.guildId,
            commandName
        });
    }
    return deferSuccess;
}

/**
 * Validates that the target user is not the invoking user or the bot.
 * Throws TitanBotError on violation.
 * @param {string} targetId - The target user's ID
 * @param {import('discord.js').CommandInteraction} interaction
 * @param {import('discord.js').Client} client
 * @param {string} actionName - e.g. "ban", "kick", "timeout"
 */
export function guardSelfTarget(targetId, interaction, client, actionName) {
    if (targetId === interaction.user.id) {
        throw new TitanBotError(
            `Cannot ${actionName} self`,
            ErrorTypes.VALIDATION,
            `You cannot ${actionName} yourself.`
        );
    }
    if (targetId === client.user.id) {
        throw new TitanBotError(
            `Cannot ${actionName} bot`,
            ErrorTypes.VALIDATION,
            `You cannot ${actionName} the bot.`
        );
    }
}

/**
 * Checks that the invoking member has the required permission.
 * Throws TitanBotError on failure.
 * @param {import('discord.js').CommandInteraction} interaction
 * @param {bigint} permission - PermissionFlagsBits value
 * @param {string} permissionName - Human-readable name, e.g. "Kick Members"
 */
export function guardPermission(interaction, permission, permissionName) {
    if (!interaction.member.permissions.has(permission)) {
        throw new TitanBotError(
            'User lacks permission',
            ErrorTypes.PERMISSION,
            `You need the \`${permissionName}\` permission to use this command.`,
            { userId: interaction.user.id, guildId: interaction.guildId }
        );
    }
}

/**
 * Ensures the command is used inside a guild. Throws TitanBotError otherwise.
 * @param {import('discord.js').CommandInteraction} interaction
 */
export function guardGuild(interaction) {
    if (!interaction.inGuild()) {
        throw new TitanBotError(
            'Command used outside guild',
            ErrorTypes.VALIDATION,
            'This command can only be used in a server.',
            { userId: interaction.user.id }
        );
    }
}

/**
 * Checks rate limiting for a given action key.
 * Returns true if allowed, or sends a warning embed and returns false.
 * @param {import('discord.js').CommandInteraction} interaction
 * @param {string} actionKey - e.g. "purge", "massban"
 * @param {number} [maxAttempts=5] - Max attempts in the window
 * @param {number} [windowMs=60000] - Time window in ms
 * @returns {Promise<boolean>} true if allowed
 */
export async function guardRateLimit(interaction, actionKey, maxAttempts = 5, windowMs = 60000) {
    const rateLimitKey = `${actionKey}_${interaction.user.id}`;
    const isAllowed = await checkRateLimit(rateLimitKey, maxAttempts, windowMs);
    if (!isAllowed) {
        await InteractionHelper.safeEditReply(interaction, {
            embeds: [
                warningEmbed(
                    `You're performing this action too fast. Please wait before trying again.`,
                    '⏳ Rate Limited'
                ),
            ],
            flags: MessageFlags.Ephemeral,
        });
    }
    return isAllowed;
}

/**
 * Validates that a target guild member exists and is actable upon.
 * Throws TitanBotError if the member is not in the server.
 * @param {import('discord.js').GuildMember|null} member
 */
export function guardMemberExists(member) {
    if (!member) {
        throw new TitanBotError(
            'Target not found',
            ErrorTypes.USER_INPUT,
            'The target user is not currently in this server.',
            { subtype: 'user_not_found' }
        );
    }
}

/**
 * Validates the invoking member outranks the target in role hierarchy.
 * Throws TitanBotError on violation.
 * @param {import('discord.js').CommandInteraction} interaction
 * @param {import('discord.js').GuildMember} targetMember
 * @param {string} actionName - e.g. "kick", "ban"
 */
export function guardRoleHierarchy(interaction, targetMember, actionName) {
    if (interaction.member.roles.highest.position <= targetMember.roles.highest.position) {
        throw new TitanBotError(
            `Cannot ${actionName} user`,
            ErrorTypes.PERMISSION,
            `You cannot ${actionName} a user with an equal or higher role than you.`
        );
    }
}

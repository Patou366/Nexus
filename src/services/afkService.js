import { getFromDb, setInDb, deleteFromDb } from '../utils/database.js';
import { logger } from '../utils/logger.js';

/**
 * AFK Service
 * Stores per-user, per-guild AFK status with a custom message.
 * When an AFK user is mentioned, the bot replies with their message.
 * When an AFK user sends a message, their status is automatically cleared.
 */

const MAX_AFK_MESSAGE_LENGTH = 200;

function getAfkKey(guildId, userId) {
  return `guild:${guildId}:afk:${userId}`;
}

/**
 * Set a user's AFK status
 * @param {string} guildId
 * @param {string} userId
 * @param {string} message - The custom AFK message
 * @returns {Promise<boolean>} Success status
 */
export async function setAfk(guildId, userId, message) {
  try {
    const cleanMessage = (typeof message === 'string' && message.trim().length > 0)
      ? message.trim().slice(0, MAX_AFK_MESSAGE_LENGTH)
      : 'AFK';

    await setInDb(getAfkKey(guildId, userId), {
      message: cleanMessage,
      since: Date.now()
    });
    return true;
  } catch (error) {
    logger.error(`Error setting AFK for user ${userId} in guild ${guildId}:`, error);
    return false;
  }
}

/**
 * Get a user's AFK status
 * @param {string} guildId
 * @param {string} userId
 * @returns {Promise<{message: string, since: number} | null>}
 */
export async function getAfk(guildId, userId) {
  try {
    return await getFromDb(getAfkKey(guildId, userId), null);
  } catch (error) {
    logger.error(`Error getting AFK for user ${userId} in guild ${guildId}:`, error);
    return null;
  }
}

/**
 * Clear a user's AFK status
 * @param {string} guildId
 * @param {string} userId
 * @returns {Promise<boolean>} Success status
 */
export async function clearAfk(guildId, userId) {
  try {
    await deleteFromDb(getAfkKey(guildId, userId));
    return true;
  } catch (error) {
    logger.error(`Error clearing AFK for user ${userId} in guild ${guildId}:`, error);
    return false;
  }
}

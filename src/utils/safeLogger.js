import { logger } from './logger.js';

/**
 * Wraps a logging call in a try/catch so failures never propagate.
 * Useful for fire-and-forget audit logging where the caller should
 * not fail because of a logging error.
 *
 * @param {Function} logFn - Async function that performs the logging
 * @param {string} [context='event'] - Short label for debug messages on failure
 * @returns {Promise<void>}
 */
export async function safeLogEvent(logFn, context = 'event') {
    try {
        await logFn();
    } catch (error) {
        logger.debug(`Error logging ${context}:`, error);
    }
}

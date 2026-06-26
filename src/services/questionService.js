import { getFromDb, setInDb, db } from '../utils/database.js';
import { logger } from '../utils/logger.js';

/**
 * In-memory store for active questions.
 * Key: messageId
 * Value: {
 *   question: string,
 *   options: string[3],       // shuffled [A, B, C]
 *   correctIndex: number,     // 0 | 1 | 2
 *   answeredUsers: Set<userId>,
 *   correctUsers: Set<userId>,
 *   guildId: string,
 *   channelId: string,
 *   messageId: string,
 *   timeoutId: Timeout
 * }
 */
export const activeQuestions = new Map();

function qScoreKey(guildId, userId) {
    return `guild:${guildId}:qscore:${userId}`;
}

/** Increment a user's correct-answer count and return the new total. */
export async function incrementQScore(guildId, userId) {
    try {
        const key = qScoreKey(guildId, userId);
        const current = await getFromDb(key, 0);
        const next = (typeof current === 'number' ? current : 0) + 1;
        await setInDb(key, next);
        return next;
    } catch (error) {
        logger.error(`Error incrementing qscore for ${userId} in ${guildId}:`, error);
        return null;
    }
}

/** Fetch a user's correct-answer count. */
export async function getQScore(guildId, userId) {
    return getFromDb(qScoreKey(guildId, userId), 0);
}

/** Return the top `limit` scorers for the guild, sorted descending. */
export async function getQLeaderboard(guildId, limit = 10) {
    try {
        const prefix = `guild:${guildId}:qscore:`;
        const keys = await db.list(prefix);
        if (!keys || keys.length === 0) return [];

        const scores = await Promise.all(
            keys.map(async key => {
                const userId = key.replace(prefix, '');
                const score = await getFromDb(key, 0);
                return { userId, score: typeof score === 'number' ? score : 0 };
            })
        );

        return scores
            .filter(s => s.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);
    } catch (error) {
        logger.error(`Error fetching qleaderboard for ${guildId}:`, error);
        return [];
    }
}

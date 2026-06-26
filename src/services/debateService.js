/**
 * In-memory store for active debates.
 * Key: messageId
 * Value: {
 *   topic: string,
 *   forVoters: Set<userId>,
 *   againstVoters: Set<userId>,
 *   guildId: string,
 *   channelId: string,
 *   messageId: string,
 *   timeoutId: Timeout
 * }
 */
export const activeDebates = new Map();

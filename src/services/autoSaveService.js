import { logger } from '../utils/logger.js';
import { getFromDb, setInDb } from '../utils/database.js';
import { saveServerSnapshot, captureServerLayout, getServerSaves, MAX_SAVES_PER_GUILD } from './serverBackupService.js';
import { EmbedBuilder } from 'discord.js';
import { getColor } from '../config/bot.js';

const AUTO_SAVE_INTERVAL_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

function getAutoSaveConfigKey(guildId) {
    return `guild:${guildId}:autosave:config`;
}

/**
 * Get the auto-save config for a guild.
 * Returns { channelId: string|null, lastSaveAt: number|null }
 */
export async function getAutoSaveConfig(client, guildId) {
    try {
        const raw = await client.db.get(getAutoSaveConfigKey(guildId), {});
        return {
            channelId: raw?.channelId ?? null,
            lastSaveAt: raw?.lastSaveAt ?? null,
        };
    } catch (error) {
        logger.error(`[AutoSave] Error reading config for guild ${guildId}:`, error);
        return { channelId: null, lastSaveAt: null };
    }
}

/**
 * Update the auto-save config for a guild (partial merge).
 */
export async function setAutoSaveConfig(client, guildId, updates) {
    try {
        const existing = await getAutoSaveConfig(client, guildId);
        const merged = { ...existing, ...updates };
        await client.db.set(getAutoSaveConfigKey(guildId), merged);
        return true;
    } catch (error) {
        logger.error(`[AutoSave] Error saving config for guild ${guildId}:`, error);
        return false;
    }
}

/**
 * Run the auto-save check for all guilds the bot is in.
 * Called by a daily cron — saves each guild whose last auto-save was ≥3 days ago.
 */
export async function runAutoSave(client) {
    if (!client.isReady() || !client.db) return;

    logger.info('[AutoSave] Running scheduled auto-save check...');

    for (const [guildId, guild] of client.guilds.cache) {
        try {
            const config = await getAutoSaveConfig(client, guildId);
            const now = Date.now();

            // Skip if it hasn't been 3 days yet
            if (config.lastSaveAt && now - config.lastSaveAt < AUTO_SAVE_INTERVAL_MS) {
                logger.debug(`[AutoSave] Skipping guild ${guildId} — last save was less than 3 days ago`);
                continue;
            }

            logger.info(`[AutoSave] Saving guild ${guildId} (${guild.name})...`);

            // Perform the snapshot (bot ID as creator)
            const snapshot = captureServerLayout(guild, client.user.id);
            const result = await saveServerSnapshot(guildId, snapshot);

            if (!result.success) {
                logger.warn(`[AutoSave] Snapshot failed for guild ${guildId}`);
                continue;
            }

            // Update lastSaveAt
            await setAutoSaveConfig(client, guildId, { lastSaveAt: now });

            logger.info(`[AutoSave] Guild ${guildId} saved successfully (ID: ${result.saveId})`);

            // Send notification if a channel is configured
            if (!config.channelId) continue;

            const channel = guild.channels.cache.get(config.channelId);
            if (!channel?.isTextBased?.()) continue;

            const me = guild.members.me;
            if (!me?.permissionsIn(channel).has(['ViewChannel', 'SendMessages', 'EmbedLinks'])) continue;

            const existingSaves = await getServerSaves(guildId);
            const totalChannels = snapshot.categories.reduce((acc, cat) => acc + cat.channels.length, 0);
            const totalCategories = snapshot.categories.filter(c => c.id !== null).length;
            const totalRoles = snapshot.roles?.length ?? 0;

            const embed = new EmbedBuilder()
                .setColor(getColor('success'))
                .setTitle('🔒 Automatic Server Backup / Copia de Seguridad Automática')
                .setDescription(
                    `The server has been automatically backed up every 3 days.\n` +
                    `El servidor ha sido respaldado automáticamente cada 3 días.`
                )
                .addFields(
                    { name: '🆔 Save ID / ID de Guardado', value: `\`${result.saveId}\``, inline: true },
                    { name: '🎭 Roles', value: `${totalRoles}`, inline: true },
                    { name: '📁 Categories / Categorías', value: `${totalCategories}`, inline: true },
                    { name: '💬 Channels / Canales', value: `${totalChannels}`, inline: true },
                    { name: '💾 Saves Used / Guardados Usados', value: `${existingSaves.length}/${MAX_SAVES_PER_GUILD}`, inline: true },
                )
                .setFooter({ text: 'Use /restore <save_id> to restore · Usa /restore <id> para restaurar' })
                .setTimestamp();

            if (result.overwritten) {
                embed.addFields({
                    name: '⚠️ Oldest Overwritten / Antiguo Sobrescrito',
                    value: `\`${result.overwritten}\``,
                    inline: true
                });
            }

            await channel.send({ embeds: [embed] });

        } catch (error) {
            logger.error(`[AutoSave] Error processing guild ${guildId}:`, error);
        }
    }

    logger.info('[AutoSave] Auto-save check complete.');
}

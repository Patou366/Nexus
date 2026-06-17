import { EmbedBuilder } from 'discord.js';
import { getFromDb, setInDb } from '../utils/database.js';
import { logger } from '../utils/logger.js';
import { getColor } from '../config/bot.js';

const MILESTONE_INTERVAL = 100;

export async function getMilestoneConfig(client, guildId) {
    const configKey = `milestones:${guildId}:config`;
    return await getFromDb(configKey, {
        enabled: false,
        channelId: null,
        lastMilestone: 0
    });
}

export async function saveMilestoneConfig(client, guildId, config) {
    const configKey = `milestones:${guildId}:config`;
    await setInDb(configKey, config);
}

export function isMilestone(memberCount) {
    return memberCount > 0 && memberCount % MILESTONE_INTERVAL === 0;
}

export function getNextMilestone(currentCount) {
    return Math.ceil(currentCount / MILESTONE_INTERVAL) * MILESTONE_INTERVAL;
}

export async function checkAndAnnounceMilestone(client, guild, member, currentCount) {
    try {
        const config = await getMilestoneConfig(client, guild.id);

        if (!config.enabled || !config.channelId) {
            return { announced: false, reason: 'Milestones not configured' };
        }

        // Check if this is a milestone number
        if (!isMilestone(currentCount)) {
            return { announced: false, reason: 'Not a milestone number' };
        }

        // Check if we already announced this milestone (prevent duplicates)
        if (config.lastMilestone >= currentCount) {
            return { announced: false, reason: 'Milestone already announced' };
        }

        // Get the channel
        const channel = await guild.channels.fetch(config.channelId).catch(() => null);
        if (!channel || !channel.isTextBased?.()) {
            logger.warn(`Milestone channel ${config.channelId} not found in guild ${guild.id}`);
            return { announced: false, reason: 'Channel not found' };
        }

        // Send milestone announcement
        const embed = new EmbedBuilder()
            .setColor(getColor('success'))
            .setTitle('🎉 Milestone Reached! / 🎉 Hito Alcanzado!')
            .setDescription(
                `We just hit **${currentCount}** members!\n\n` +
                `A shoutout to ${member} for being our **${currentCount}**th member!\n\n` +
                `---\n\n` +
                `¡Acabamos de llegar a **${currentCount}** miembros!\n\n` +
                `¡Un saludo a ${member} por ser nuestro miembro número **${currentCount}**!`
            )
            .addFields(
                {
                    name: 'Members / Miembros',
                    value: currentCount.toString(),
                    inline: true
                },
                {
                    name: 'New Member / Nuevo Miembro',
                    value: `${member.user.tag}`,
                    inline: true
                }
            )
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
            .setFooter({ text: guild.name, iconURL: guild.iconURL?.() })
            .setTimestamp();

        await channel.send({
            content: `${member}`, // Ping the milestone member
            embeds: [embed]
        });

        // Update the last milestone
        config.lastMilestone = currentCount;
        await saveMilestoneConfig(client, guild.id, config);

        logger.info(`Milestone ${currentCount} announced in guild ${guild.id}`);

        return { announced: true, milestone: currentCount };
    } catch (error) {
        logger.error('Error checking/announcing milestone:', error);
        return { announced: false, reason: error.message };
    }
}

export { MILESTONE_INTERVAL };

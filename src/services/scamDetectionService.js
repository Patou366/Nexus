import { logger } from '../utils/logger.js';
import { getFromDb, setInDb } from '../utils/database.js';

const SCAM_KEYWORDS = [
  'rug pull',
  'rugpull',
  'made',
  'sol',
  'giving out',
  'giveaway',
  'free sol',
  'airdrop',
  'double your',
  '2x your',
  'send sol get',
  'send eth get',
  'send btc get',
  'instant withdrawal',
  'withdrawal success',
  'withdraw success',
  'bonus code',
  'activate code',
  'rakeback',
  'honestly6239',
  'crypto casino',
  'deposit bonus',
  'free money',
  'easy money',
  'get rich',
  'guaranteed profit',
  'no risk',
  '100% legit',
  'verified giveaway',
  'claim now',
  'limited spots',
  'dm me for',
  'click the link',
  'verify your wallet',
  'connect wallet',
  'seed phrase',
  'private key',
  'recovery phrase',
];

const SCAM_IMAGE_INDICATORS = [
  'withdrawal success',
  'withdraw success',
  'bonus',
  'activate code',
  'rakeback',
  'honestly',
  'mrbeast',
  'mr beast',
  'crypto casino',
  'deposit',
  'free sol',
  'free money',
  'giveaway',
  'rug pull',
  'rugpull',
];

const SCAM_RESPONSES = [
  'Yes, I want to get scammed lol',
  'Wow, totally not a scam at all 😂',
  'Let me just send my life savings real quick',
  'Ah yes, the classic "I made 500 SOL" story',
  'Where do I sign up to lose everything?',
  'This is definitely how wealth works',
  'Financial advice of the century right here',
];

function getBotAlertsKey(guildId) {
  return `guild:${guildId}:bot_alerts`;
}

export async function getBotAlertsConfig(client, guildId) {
  try {
    const key = getBotAlertsKey(guildId);
    const config = await getFromDb(key, null);
    return config || { enabled: false, roleId: null, channelId: null };
  } catch (error) {
    logger.error(`Error getting bot alerts config for guild ${guildId}:`, error);
    return { enabled: false, roleId: null, channelId: null };
  }
}

export async function setBotAlertsConfig(client, guildId, roleId, channelId = null) {
  try {
    const key = getBotAlertsKey(guildId);
    const config = {
      enabled: true,
      roleId,
      channelId,
      updatedAt: Date.now(),
    };
    await setInDb(key, config);
    return true;
  } catch (error) {
    logger.error(`Error setting bot alerts config for guild ${guildId}:`, error);
    return false;
  }
}

export async function disableBotAlerts(client, guildId) {
  try {
    const key = getBotAlertsKey(guildId);
    const config = {
      enabled: false,
      roleId: null,
      channelId: null,
      updatedAt: Date.now(),
    };
    await setInDb(key, config);
    return true;
  } catch (error) {
    logger.error(`Error disabling bot alerts for guild ${guildId}:`, error);
    return false;
  }
}

function isScamText(content) {
  if (!content || typeof content !== 'string') return false;
  const lower = content.toLowerCase();

  // Check for the specific example pattern
  const specificPattern = /made\s+\d+\s+sol.*rug\s+pull.*giving\s+out.*sol/i;
  if (specificPattern.test(lower)) return true;

  // Check keyword matches - require at least 3 matches for confidence
  let matches = 0;
  for (const keyword of SCAM_KEYWORDS) {
    if (lower.includes(keyword.toLowerCase())) {
      matches++;
    }
  }

  return matches >= 3;
}

function isScamImage(message) {
  if (!message.attachments || message.attachments.size === 0) return false;

  for (const attachment of message.attachments.values()) {
    const url = attachment.url || attachment.proxyURL || '';
    const name = attachment.name || '';
    const lowerUrl = url.toLowerCase();
    const lowerName = name.toLowerCase();

    // Check image file types
    const isImage = /\.(png|jpe?g|gif|webp|bmp|tiff?)$/i.test(name) ||
      attachment.contentType?.startsWith('image/');

    if (!isImage) continue;

    // Check URL/name for scam indicators
    for (const indicator of SCAM_IMAGE_INDICATORS) {
      if (lowerUrl.includes(indicator.toLowerCase()) ||
          lowerName.includes(indicator.toLowerCase())) {
        return true;
      }
    }
  }

  return false;
}

export function detectScamMessage(message) {
  const textMatch = isScamText(message.content);
  const imageMatch = isScamImage(message);

  return {
    isScam: textMatch || imageMatch,
    textMatch,
    imageMatch,
  };
}

export function getRandomScamResponse() {
  const index = Math.floor(Math.random() * SCAM_RESPONSES.length);
  return SCAM_RESPONSES[index];
}

export async function handleScamDetection(message, client) {
  try {
    const detection = detectScamMessage(message);
    if (!detection.isScam) return false;

    const config = await getBotAlertsConfig(client, message.guild.id);
    if (!config.enabled || !config.roleId) return false;

    const role = message.guild.roles.cache.get(config.roleId);
    if (!role) {
      logger.warn(`Bot alerts role ${config.roleId} not found in guild ${message.guild.id}`);
      return false;
    }

    // Send alert with role ping
    const alertChannel = config.channelId
      ? message.guild.channels.cache.get(config.channelId)
      : message.channel;

    if (!alertChannel) return false;

    const response = getRandomScamResponse();
    const embed = {
      color: 0xFF0000,
      title: 'Potential Scam Detected',
      description: `A potential scam message was detected in ${message.channel}.`,
      fields: [
        {
          name: 'Author',
          value: `${message.author.tag} (${message.author.id})`,
          inline: true,
        },
        {
          name: 'Detection',
          value: `${detection.textMatch ? 'Text match' : ''}${detection.textMatch && detection.imageMatch ? ' + ' : ''}${detection.imageMatch ? 'Image match' : ''}`,
          inline: true,
        },
        {
          name: 'Message Content',
          value: message.content.slice(0, 1024) || '[No text content]',
        },
      ],
      timestamp: new Date().toISOString(),
      footer: { text: 'Bot Alert System' },
    };

    await alertChannel.send({
      content: `${role} ${response}`,
      embeds: [embed],
      allowedMentions: { roles: [config.roleId] },
    });

    logger.info(`Scam alert triggered in guild ${message.guild.id} for message by ${message.author.id}`);
    return true;
  } catch (error) {
    logger.error('Error handling scam detection:', error);
    return false;
  }
}

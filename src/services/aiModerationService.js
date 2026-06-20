import OpenAI from 'openai';
import { logger } from '../utils/logger.js';
import { checkRateLimit } from '../utils/rateLimiter.js';
import { QuarantineService } from './quarantineService.js';
import { createEmbed } from '../utils/embeds.js';

const AI_RATE_LIMIT_KEY_PREFIX = 'ai-mod';
const AI_RATE_LIMIT_ATTEMPTS = 20;
const AI_RATE_LIMIT_WINDOW_MS = 60000;

const MIN_CONTENT_LENGTH = 10;

const SYSTEM_PROMPT = `You are a Discord server security analyst. Your job is to classify messages and determine if they are:
- **spam**: Unsolicited promotional messages, repetitive advertising, crypto/NFT scams, phishing links, fake giveaways
- **bot**: Automated messages from selfbots or userbot accounts — unnatural patterns, templated messages, mass-DM style content
- **raid**: Coordinated attack messages — hate speech, slurs, flooding, shock content, server destruction intent, mass pings, threats to the server
- **safe**: Normal human conversation that poses no threat

You MUST respond with ONLY a valid JSON object (no markdown, no code fences). Use this exact format:
{"classification":"safe|spam|bot|raid","confidence":0.0-1.0,"reason":"brief explanation"}

Guidelines:
- Be conservative: only flag content you are confident is malicious (confidence >= 0.75)
- Short casual messages like "hi", "lol", "gg" are ALWAYS safe
- Do not flag messages for being rude or off-topic — only flag actual security threats
- Images: if an image URL is provided, analyze it for scam screenshots, phishing pages, shock/gore content, or raid imagery`;

let openaiClient = null;

function getOpenAIClient() {
  if (openaiClient) return openaiClient;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  openaiClient = new OpenAI({ apiKey });
  return openaiClient;
}

/**
 * Analyze message text and/or images using OpenAI
 * @param {string} text - Message text content
 * @param {string[]} imageUrls - Array of image URLs from attachments
 * @returns {Promise<{classification: string, confidence: number, reason: string} | null>}
 */
async function analyzeContent(text, imageUrls = []) {
  const client = getOpenAIClient();
  if (!client) return null;

  const contentParts = [];

  if (text && text.length >= MIN_CONTENT_LENGTH) {
    contentParts.push({ type: 'text', text: `Message content:\n${text.slice(0, 2000)}` });
  }

  for (const url of imageUrls.slice(0, 3)) {
    contentParts.push({ type: 'image_url', image_url: { url, detail: 'low' } });
  }

  if (contentParts.length === 0) return null;

  try {
    const response = await client.chat.completions.create({
      model: imageUrls.length > 0 ? 'gpt-4o-mini' : 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: contentParts }
      ],
      max_tokens: 150,
      temperature: 0.1
    });

    const raw = response.choices?.[0]?.message?.content?.trim();
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed.classification || typeof parsed.confidence !== 'number') return null;

    return {
      classification: parsed.classification,
      confidence: parsed.confidence,
      reason: parsed.reason || 'No reason provided'
    };
  } catch (error) {
    if (error instanceof SyntaxError) {
      logger.debug('AI moderation returned non-JSON response');
    } else {
      logger.debug('AI moderation API error:', error.message);
    }
    return null;
  }
}

/**
 * Get the configured action for a given classification
 */
function getActionForClassification(aiConfig, classification) {
  const actions = aiConfig.actions || {};
  return actions[classification] || 'quarantine';
}

/**
 * Execute the designated action on a flagged user
 */
async function executeAction(action, message, client, aiResult, aiConfig) {
  const guild = message.guild;
  const member = message.member || await guild.members.fetch(message.author.id).catch(() => null);
  if (!member) return;

  switch (action) {
    case 'quarantine': {
      const { RaidDetectionService } = await import('./raidDetectionService.js');
      const config = await RaidDetectionService.getRaidConfig(client, guild.id);

      await QuarantineService.triggerQuarantine({
        guild,
        client,
        suspects: [member],
        reason: `ai_${aiResult.classification}`,
        metadata: {
          aiClassification: aiResult.classification,
          aiConfidence: aiResult.confidence,
          aiReason: aiResult.reason,
          messageContent: message.content?.slice(0, 500) || '[no text]',
          channelId: message.channel.id,
          detectedAt: new Date().toISOString(),
          tripReasons: [`ai_${aiResult.classification}`]
        }
      });
      break;
    }
    case 'kick': {
      if (member.kickable) {
        await member.kick(`AI Moderation: ${aiResult.classification} (${aiResult.reason})`);
      }
      break;
    }
    case 'ban': {
      if (member.bannable) {
        await guild.members.ban(member.id, {
          reason: `AI Moderation: ${aiResult.classification} (${aiResult.reason})`,
          deleteMessageSeconds: 86400
        });
      }
      break;
    }
    case 'delete': {
      if (message.deletable) {
        await message.delete().catch(() => null);
      }
      break;
    }
    case 'timeout': {
      if (member.moderatable) {
        await member.timeout(600000, `AI Moderation: ${aiResult.classification} (${aiResult.reason})`);
      }
      break;
    }
    default:
      break;
  }

  if (action !== 'delete' && message.deletable) {
    await message.delete().catch(() => null);
  }
}

/**
 * Send an alert embed to the notification channel
 */
async function sendAiAlert(message, client, aiResult, action, aiConfig) {
  const { RaidDetectionService } = await import('./raidDetectionService.js');
  const config = await RaidDetectionService.getRaidConfig(client, message.guild.id);
  const channelId = aiConfig.alertChannelId || config.notificationChannelId;
  if (!channelId) return;

  const alertChannel = message.guild.channels.cache.get(channelId);
  if (!alertChannel?.isTextBased()) return;

  const classificationEmoji = {
    spam: '📩',
    bot: '🤖',
    raid: '🚨'
  };

  const actionLabels = {
    quarantine: 'Quarantined / En Cuarentena',
    kick: 'Kicked / Expulsado',
    ban: 'Banned / Baneado',
    delete: 'Message Deleted / Mensaje Eliminado',
    timeout: 'Timed Out / Silenciado'
  };

  const embed = createEmbed({
    title: `${classificationEmoji[aiResult.classification] || '⚠️'} AI Moderation Alert / Alerta de Moderación IA`,
    description: `A message was flagged by AI analysis.\nUn mensaje fue marcado por el análisis de IA.`,
    color: aiResult.classification === 'raid' ? 'error' : 'warning',
    fields: [
      {
        name: 'Author / Autor',
        value: `${message.author} (\`${message.author.tag}\` | ${message.author.id})`,
        inline: true
      },
      {
        name: 'Channel / Canal',
        value: `${message.channel}`,
        inline: true
      },
      {
        name: 'Classification / Clasificación',
        value: `**${aiResult.classification.toUpperCase()}** (${Math.round(aiResult.confidence * 100)}% confidence)`,
        inline: true
      },
      {
        name: 'AI Reason / Razón IA',
        value: aiResult.reason.slice(0, 1024),
        inline: false
      },
      {
        name: 'Action Taken / Acción Tomada',
        value: actionLabels[action] || action,
        inline: true
      },
      {
        name: 'Message Content / Contenido',
        value: (message.content || '[No text / Sin texto]').slice(0, 1024),
        inline: false
      }
    ]
  });

  const pingContent = config.alertRoleId ? `<@&${config.alertRoleId}>` : null;
  await alertChannel.send({
    content: pingContent,
    embeds: [embed],
    allowedMentions: { roles: config.alertRoleId ? [config.alertRoleId] : [] }
  }).catch(err => logger.debug('Failed to send AI alert:', err.message));
}

export class AiModerationService {
  /**
   * Get AI moderation config for a guild
   */
  static async getAiConfig(client, guildId) {
    try {
      const { getGuildConfig } = await import('../utils/database.js');
      const config = await getGuildConfig(client, guildId);
      return {
        enabled: config?.raidShield?.aiModeration?.enabled ?? false,
        confidenceThreshold: config?.raidShield?.aiModeration?.confidenceThreshold ?? 0.80,
        scanImages: config?.raidShield?.aiModeration?.scanImages ?? true,
        alertChannelId: config?.raidShield?.aiModeration?.alertChannelId ?? null,
        actions: {
          spam: config?.raidShield?.aiModeration?.actions?.spam ?? 'quarantine',
          bot: config?.raidShield?.aiModeration?.actions?.bot ?? 'quarantine',
          raid: config?.raidShield?.aiModeration?.actions?.raid ?? 'quarantine',
          ...(config?.raidShield?.aiModeration?.actions || {})
        }
      };
    } catch (error) {
      logger.error('Error getting AI moderation config:', error);
      return {
        enabled: false,
        confidenceThreshold: 0.80,
        scanImages: true,
        alertChannelId: null,
        actions: { spam: 'quarantine', bot: 'quarantine', raid: 'quarantine' }
      };
    }
  }

  /**
   * Save AI moderation config for a guild
   */
  static async saveAiConfig(client, guildId, updates) {
    try {
      const { getGuildConfig, setGuildConfig } = await import('../utils/database.js');
      const config = await getGuildConfig(client, guildId);
      const current = config?.raidShield?.aiModeration || {};
      const aiModeration = { ...current, ...updates };
      if (updates.actions) {
        aiModeration.actions = { ...(current.actions || {}), ...updates.actions };
      }
      const raidShield = { ...config?.raidShield, aiModeration };
      await setGuildConfig(client, guildId, { ...config, raidShield });
      return true;
    } catch (error) {
      logger.error('Error saving AI moderation config:', error);
      return false;
    }
  }

  /**
   * Process a message through AI moderation
   * @param {Message} message
   * @param {Client} client
   */
  static async processMessage(message, client) {
    try {
      if (message.author.bot || !message.guild) return;

      const aiConfig = await this.getAiConfig(client, message.guild.id);
      if (!aiConfig.enabled) return;

      if (!process.env.OPENAI_API_KEY) {
        logger.debug('AI moderation enabled but OPENAI_API_KEY not set');
        return;
      }

      const rateLimitKey = `${AI_RATE_LIMIT_KEY_PREFIX}:${message.guild.id}`;
      const canProcess = await checkRateLimit(rateLimitKey, AI_RATE_LIMIT_ATTEMPTS, AI_RATE_LIMIT_WINDOW_MS);
      if (!canProcess) return;

      const text = message.content || '';
      const imageUrls = [];

      if (aiConfig.scanImages && message.attachments?.size > 0) {
        for (const attachment of message.attachments.values()) {
          const isImage = /\.(png|jpe?g|gif|webp)$/i.test(attachment.name || '') ||
            attachment.contentType?.startsWith('image/');
          if (isImage && attachment.url) {
            imageUrls.push(attachment.url);
          }
        }
      }

      if (text.length < MIN_CONTENT_LENGTH && imageUrls.length === 0) return;

      const result = await analyzeContent(text, imageUrls);
      if (!result) return;

      if (result.classification === 'safe') return;
      if (result.confidence < aiConfig.confidenceThreshold) return;

      const action = getActionForClassification(aiConfig, result.classification);

      logger.info(`AI moderation flagged message in ${message.guild.name}`, {
        event: 'ai_moderation.flagged',
        guildId: message.guild.id,
        userId: message.author.id,
        classification: result.classification,
        confidence: result.confidence,
        action
      });

      await Promise.all([
        executeAction(action, message, client, result, aiConfig),
        sendAiAlert(message, client, result, action, aiConfig)
      ]);
    } catch (error) {
      logger.error('Error in AI moderation processing:', error);
    }
  }
}

import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger } from '../utils/logger.js';
import { checkRateLimit } from '../utils/rateLimiter.js';
import { QuarantineService } from './quarantineService.js';
import { createEmbed } from '../utils/embeds.js';
import axios from 'axios';

const AI_RATE_LIMIT_KEY = 'ai-mod-global';
const AI_RATE_LIMIT_ATTEMPTS = 9;
const AI_RATE_LIMIT_WINDOW_MS = 60000;

const MIN_CONTENT_LENGTH = 4;

const IMAGE_CACHE_MAX_SIZE = 100;
const IMAGE_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const imageCache = new Map();

const RETRY_MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 1000;

const CONTEXT_MESSAGES_LIMIT = 5;

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
- Images: if an image is provided, analyze it for scam screenshots, phishing pages, shock/gore content, or raid imagery`;

const SYSTEM_PROMPT_WITH_CONTEXT = `You are a Discord server security analyst. Your job is to classify messages and determine if they are:
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
- Images: if an image is provided, analyze it for scam screenshots, phishing pages, shock/gore content, or raid imagery
- Context: Recent messages from the same channel are provided. Look for patterns like: same user posting rapidly, multiple users posting similar content (coordinated raid), or spam flooding`;

let geminiClient = null;

function getGeminiClient() {
  if (geminiClient) return geminiClient;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    logger.warn('⚠️ GEMINI_API_KEY not set in environment variables');
    return null;
  }
  geminiClient = new GoogleGenerativeAI(apiKey);
  return geminiClient;
}

function getCachedImage(url) {
  const cached = imageCache.get(url);
  if (!cached) return null;
  if (Date.now() - cached.timestamp > IMAGE_CACHE_TTL_MS) {
    imageCache.delete(url);
    return null;
  }
  return cached.data;
}

function setCachedImage(url, data) {
  if (imageCache.size >= IMAGE_CACHE_MAX_SIZE) {
    const oldestKey = imageCache.keys().next().value;
    if (oldestKey) imageCache.delete(oldestKey);
  }
  imageCache.set(url, { data, timestamp: Date.now() });
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function retryWithBackoff(fn, context = 'operation') {
  let lastError = null;
  for (let attempt = 1; attempt <= RETRY_MAX_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const isRetryable = !error.status || error.status === 429 || error.status >= 500;
      if (!isRetryable || attempt === RETRY_MAX_ATTEMPTS) {
        throw error;
      }
      const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
      logger.warn(`Retry ${attempt}/${RETRY_MAX_ATTEMPTS} for ${context} after ${delay}ms`, {
        error: error.message
      });
      await sleep(delay);
    }
  }
  throw lastError;
}

async function fetchRecentMessages(channel, beforeMessageId) {
  try {
    const messages = await channel.messages.fetch({
      limit: CONTEXT_MESSAGES_LIMIT,
      before: beforeMessageId
    });
    const formatted = [];
    for (const msg of messages.values()) {
      if (msg.author.bot) continue;
      const content = msg.content?.trim();
      if (content && content.length >= MIN_CONTENT_LENGTH) {
        formatted.push({
          author: msg.author.tag,
          content: content.slice(0, 200),
          timestamp: msg.createdTimestamp
        });
      }
    }
    return formatted.sort((a, b) => b.timestamp - a.timestamp).slice(0, CONTEXT_MESSAGES_LIMIT);
  } catch (error) {
    logger.debug('Failed to fetch recent messages for context:', error.message);
    return [];
  }
}

async function fetchImageAsInlineData(url) {
  const cached = getCachedImage(url);
  if (cached) {
    logger.debug('Using cached image data');
    return cached;
  }

  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 10000,
      maxContentLength: 4 * 1024 * 1024,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8'
      }
    });
    const mimeType = response.headers['content-type'] || 'image/png';
    const base64 = Buffer.from(response.data).toString('base64');
    const result = { inlineData: { data: base64, mimeType } };
    setCachedImage(url, result);
    return result;
  } catch (error) {
    logger.error(`Failed to fetch image for AI analysis: ${error.message}`);
    return null;
  }
}

async function analyzeContent(text, imageUrls = [], recentMessages = []) {
  const client = getGeminiClient();
  if (!client) {
    logger.warn('🚨 AI moderation: Gemini client not initialized (missing API key)');
    return null;
  }

  logger.info('🔍 AI moderation: Starting analysis', {
    textLength: text?.length ?? 0,
    imageCount: imageUrls.length,
    contextMessages: recentMessages.length
  });

  const parts = [];

  if (text && text.length >= MIN_CONTENT_LENGTH) {
    parts.push({ text: `Message content:\n${text.slice(0, 2000)}` });
  }

  for (const url of imageUrls.slice(0, 3)) {
    const imagePart = await fetchImageAsInlineData(url);
    if (imagePart) parts.push(imagePart);
  }

  if (parts.length === 0) {
    logger.debug('AI moderation: No analysable content (text too short and no images)');
    return null;
  }

  const hasContext = recentMessages.length > 0;
  const systemPrompt = hasContext ? SYSTEM_PROMPT_WITH_CONTEXT : SYSTEM_PROMPT;

  if (hasContext) {
    const contextText = recentMessages.map(m =>
      `[${m.author}]: ${m.content}`
    ).join('\n');
    parts.push({ text: `\nRecent channel context:\n${contextText}` });
  }

  try {
    const result = await retryWithBackoff(async () => {
      const model = client.getGenerativeModel({
        model: 'gemini-2.5-flash',
        systemInstruction: systemPrompt
      });

      logger.debug('📤 Sending request to Gemini API...');
      return await model.generateContent({
        contents: [{ role: 'user', parts }],
        generationConfig: {
          maxOutputTokens: 150,
          temperature: 0.1
        }
      });
    }, 'Gemini API call');

    const raw = result.response?.text()?.trim();

    if (!raw) {
      logger.warn('⚠️ Gemini returned an empty response');
      return null;
    }

    logger.debug('📥 Raw Gemini response received:', raw.slice(0, 200));

    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (parseError) {
      logger.error('❌ Failed to parse Gemini response as JSON', {
        parseError: parseError.message,
        rawResponse: raw.slice(0, 500)
      });
      return null;
    }

    if (!parsed.classification || typeof parsed.confidence !== 'number') {
      logger.error('❌ Parsed JSON missing required fields', {
        parsed: JSON.stringify(parsed)
      });
      return null;
    }

    const classification = {
      classification: parsed.classification,
      confidence: parsed.confidence,
      reason: parsed.reason || 'No reason provided'
    };

    logger.info(`✅ Classification result: ${classification.classification} (${Math.round(classification.confidence * 100)}%)`, {
      reason: classification.reason
    });

    return classification;
  } catch (error) {
    logger.error(`❌ Gemini API call failed: ${error.message}`, {
      errorCode: error.code ?? error.status ?? 'UNKNOWN',
      errorName: error.name
    });
    return null;
  }
}

function getActionForClassification(aiConfig, classification) {
  const actions = aiConfig.actions || {};
  return actions[classification] || 'quarantine';
}

async function executeAction(action, message, client, aiResult, aiConfig) {
  const guild = message.guild;
  const member = message.member || await guild.members.fetch(message.author.id).catch(() => null);
  if (!member) return;

  switch (action) {
    case 'quarantine': {
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
        value: (aiResult.reason || 'No reason provided').slice(0, 1024),
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
  static async getAiConfig(client, guildId) {
    try {
      const { getGuildConfig } = await import('../utils/database.js');
      const config = await getGuildConfig(client, guildId);
      return {
        enabled: config?.raidShield?.aiModeration?.enabled ?? false,
        confidenceThreshold: config?.raidShield?.aiModeration?.confidenceThreshold ?? 0.80,
        scanImages: config?.raidShield?.aiModeration?.scanImages ?? true,
        alertChannelId: config?.raidShield?.aiModeration?.alertChannelId ?? null,
        trustedRoles: config?.raidShield?.aiModeration?.trustedRoles ?? [],
        enableContext: config?.raidShield?.aiModeration?.enableContext ?? true,
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
        trustedRoles: [],
        enableContext: true,
        actions: { spam: 'quarantine', bot: 'quarantine', raid: 'quarantine' }
      };
    }
  }

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

  static async processMessage(message, client) {
    try {
      if (message.author.bot || !message.guild) return;

      // Upgrade 2: Skip webhook messages
      if (message.webhookId) {
        logger.debug('Skipping webhook message');
        return;
      }

      logger.info('🎯 AI Moderation: Message received', {
        guildId: message.guild.id,
        userId: message.author.id,
        contentLength: message.content?.length ?? 0
      });

      const aiConfig = await this.getAiConfig(client, message.guild.id);

      if (!aiConfig.enabled) {
        logger.debug('AI moderation disabled for this guild');
        return;
      }

      if (!process.env.GEMINI_API_KEY) {
        logger.warn('🚨 AI moderation enabled but GEMINI_API_KEY not set in environment');
        return;
      }

      // Upgrade 4: Trusted role bypass
      const member = message.member || await message.guild.members.fetch(message.author.id).catch(() => null);
      if (member && aiConfig.trustedRoles?.length > 0) {
        const hasTrustedRole = aiConfig.trustedRoles.some(roleId => member.roles.cache.has(roleId));
        if (hasTrustedRole) {
          logger.debug('User has trusted role, skipping AI moderation');
          return;
        }
      }

      const canProcess = await checkRateLimit(AI_RATE_LIMIT_KEY, AI_RATE_LIMIT_ATTEMPTS, AI_RATE_LIMIT_WINDOW_MS);
      if (!canProcess) {
        logger.info('⏱️ Global rate limit exceeded, skipping message');
        return;
      }

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

      if (text.length < MIN_CONTENT_LENGTH && imageUrls.length === 0) {
        logger.debug('Message too short and no images, skipping');
        return;
      }

      // Upgrade 5: Context-aware analysis
      let recentMessages = [];
      if (aiConfig.enableContext) {
        recentMessages = await fetchRecentMessages(message.channel, message.id);
      }

      const result = await analyzeContent(text, imageUrls, recentMessages);

      if (!result) {
        logger.debug('No analysis result returned');
        return;
      }

      if (result.classification === 'safe') {
        logger.debug('Message classified as safe');
        return;
      }

      if (result.confidence < aiConfig.confidenceThreshold) {
        logger.debug(`Confidence ${result.confidence} below threshold ${aiConfig.confidenceThreshold}`);
        return;
      }

      const action = getActionForClassification(aiConfig, result.classification);

      logger.warn(`🚨 AI MODERATION TRIGGERED: ${result.classification.toUpperCase()} (${Math.round(result.confidence * 100)}%)`, {
        guildId: message.guild.id,
        userId: message.author.id,
        action: action,
        reason: result.reason
      });

      await Promise.all([
        executeAction(action, message, client, result, aiConfig),
        sendAiAlert(message, client, result, action, aiConfig)
      ]);
    } catch (error) {
      logger.error('❌ Error in AI moderation processing:', error);
    }
  }

  // Upgrade 3: Message edit handling
  static async processMessageEdit(oldMessage, newMessage, client) {
    if (!oldMessage || !newMessage) return;

    // Skip if content and attachments unchanged
    if (oldMessage.content === newMessage.content &&
        oldMessage.attachments?.size === newMessage.attachments?.size) {
      return;
    }

    if (newMessage.author?.bot || !newMessage.guild) return;

    // Skip webhook messages
    if (newMessage.webhookId) {
      logger.debug('Skipping edited webhook message');
      return;
    }

    logger.info('🔄 AI Moderation: Processing edited message', {
      guildId: newMessage.guild.id,
      userId: newMessage.author.id,
      oldLength: oldMessage.content?.length ?? 0,
      newLength: newMessage.content?.length ?? 0
    });

    await this.processMessage(newMessage, client);
  }

  static clearImageCache() {
    imageCache.clear();
    logger.debug('Image analysis cache cleared');
  }

  static getImageCacheStats() {
    return {
      size: imageCache.size,
      maxSize: IMAGE_CACHE_MAX_SIZE,
      ttlMs: IMAGE_CACHE_TTL_MS
    };
  }
}

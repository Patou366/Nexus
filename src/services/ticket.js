import {
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionFlagsBits,
  AttachmentBuilder,
} from 'discord.js';
import { getGuildConfig } from './guildConfig.js';
import { getTicketData, saveTicketData, deleteTicketData, getOpenTicketCountForUser, incrementTicketCounter, db } from '../utils/database.js';
import { logger } from '../utils/logger.js';
import { createEmbed, errorEmbed } from '../utils/embeds.js';
import { logTicketEvent } from '../utils/ticketLogging.js';
import { BotConfig } from '../config/bot.js';
import { ensureTypedServiceError } from '../utils/serviceErrorBoundary.js';


function getPriorityMap() {
  const priorities = BotConfig.tickets?.priorities || {
    none: { emoji: "⚪", color: "#95A5A6", label: "None" },
    low: { emoji: "🟢", color: "#2ECC71", label: "Low" },
    medium: { emoji: "🟡", color: "#F1C40F", label: "Medium" },
    high: { emoji: "🔴", color: "#E74C3C", label: "High" },
    urgent: { emoji: "🚨", color: "#E91E63", label: "Urgent" },
  };

  const map = {};
  for (const [key, config] of Object.entries(priorities)) {
    map[key] = {
      name: `${config.emoji} ${config.label.toUpperCase()}`,
      color: config.color,
      emoji: config.emoji,
      label: config.label,
    };
  }
  return map;
}

const PRIORITY_MAP = getPriorityMap();
const TICKET_DELETE_DELAY_MS = 3000;
const TICKET_DELETE_DELAY_SECONDS = Math.floor(TICKET_DELETE_DELAY_MS / 1000);

const DEFAULT_TAGS = ['bug', 'feature', 'billing', 'general', 'technical', 'urgent'];


export async function getUserTicketCount(guildId, userId) {
  try {
    return await getOpenTicketCountForUser(guildId, userId);
  } catch (error) {
    const typedError = ensureTypedServiceError(error, {
      service: 'ticketService',
      operation: 'getUserTicketCount',
      message: 'Ticket operation failed: getUserTicketCount',
      userMessage: 'Failed to count open tickets.',
      context: { guildId, userId }
    });
    logger.error('Error counting user tickets:', {
      guildId,
      userId,
      error: typedError.message,
      errorCode: typedError.context?.errorCode
    });
    return 0;
  }
}

export async function createTicket(guild, member, categoryId, reason = 'No reason provided', priority = 'none', ticketType = null) {
  try {
    const config = await getGuildConfig(guild.client, guild.id);
    const ticketConfig = config.tickets || {};

    const maxTicketsPerUser = config.maxTicketsPerUser ?? 3;
    const currentTicketCount = await getUserTicketCount(guild.id, member.id);

    if (currentTicketCount >= maxTicketsPerUser) {
      return {
        success: false,
        error: `You have reached the maximum number of open tickets (${maxTicketsPerUser}). Please close your existing tickets before creating a new one.`
      };
    }

    let category = categoryId ?
      guild.channels.cache.get(categoryId) :
      guild.channels.cache.find(c =>
        c.type === ChannelType.GuildCategory &&
        c.name.toLowerCase().includes('tickets')
      );

    if (!category && !categoryId) {
      category = await guild.channels.create({
        name: 'Tickets',
        type: ChannelType.GuildCategory,
        permissionOverwrites: [
          {
            id: guild.id,
            deny: [PermissionFlagsBits.ViewChannel],
          },
        ],
      });
    }

    const ticketNumber = await getNextTicketNumber(guild.id);

    let channelName = `ticket-${ticketNumber}`;

    if (ticketType) {
      const typePrefix = ticketType.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 8);
      channelName = `${typePrefix}-${ticketNumber}`;
    }

    if (priority !== 'none') {
      const priorityInfo = PRIORITY_MAP[priority];
      if (priorityInfo) {
        channelName = `${priorityInfo.emoji} ${channelName}`;
      }
    }

    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: category?.id,
      permissionOverwrites: [
        {
          id: guild.id,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: member.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        },
        ...(config.ticketStaffRoleId ? [{
          id: config.ticketStaffRoleId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.ManageChannels,
          ],
        }] : []),
      ],
    });

    const ticketData = {
      id: channel.id,
      userId: member.id,
      guildId: guild.id,
      createdAt: new Date().toISOString(),
      status: 'open',
      claimedBy: null,
      priority: priority || 'none',
      reason,
      ticketType: ticketType || null,
      tags: [],
      watchers: [],
      notes: [],
      lastActivityAt: new Date().toISOString(),
    };

    await saveTicketData(guild.id, channel.id, ticketData);

    const priorityInfo = PRIORITY_MAP[priority] || PRIORITY_MAP.none;
    const typeDisplay = ticketType ? `\n**Type:** ${ticketType}` : '';

    const embed = createEmbed({
      title: `🎫 Ticket #${ticketNumber}`,
      description: `${member.toString()}, thank you for creating a ticket!\n\n**Reason:** ${reason}\n**Priority:** ${priorityInfo.emoji} ${priorityInfo.label}${typeDisplay}`,
      color: priorityInfo.color,
      fields: [
        { name: '📊 Status', value: '🟢 Open', inline: true },
        { name: '👤 Claimed By', value: 'Unclaimed', inline: true },
        { name: '📅 Created', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true },
      ],
      footer: { text: `Ticket ID: ${channel.id}` },
      thumbnail: member.displayAvatarURL ? { url: member.displayAvatarURL({ size: 64 }) } : undefined,
    });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ticket_close')
        .setLabel('Close')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🔒'),
      new ButtonBuilder()
        .setCustomId('ticket_claim')
        .setLabel('Claim')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🙋'),
      new ButtonBuilder()
        .setCustomId('ticket_pin')
        .setLabel('Pin')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('📌'),
      new ButtonBuilder()
        .setCustomId('ticket_note')
        .setLabel('Add Note')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('📝')
    );

    const staffMention = config.ticketStaffRoleId ? ` <@&${config.ticketStaffRoleId}>` : '';
    const messageContent = `${member.toString()}${staffMention}`;

    const ticketMessage = await channel.send({
      content: messageContent,
      embeds: [embed],
      components: [row]
    });

    await ticketMessage.pin().catch(() => {});

    await logTicketEvent({
      client: guild.client,
      guildId: guild.id,
      event: {
        type: 'open',
        ticketId: channel.id,
        ticketNumber: ticketNumber,
        userId: member.id,
        executorId: member.id,
        reason: reason,
        priority: priority || 'none',
        metadata: {
          channelId: channel.id,
          categoryName: category?.name || 'Default',
          ticketType: ticketType
        }
      }
    });

    return { success: true, channel, ticketData, ticketNumber };

  } catch (error) {
    const typedError = ensureTypedServiceError(error, {
      service: 'ticketService',
      operation: 'createTicket',
      message: 'Ticket operation failed: createTicket',
      userMessage: 'Failed to create ticket. Please try again in a moment.',
      context: { guildId: guild?.id, userId: member?.id }
    });
    logger.error('Error creating ticket:', {
      guildId: guild?.id,
      userId: member?.id,
      error: typedError.message,
      errorCode: typedError.context?.errorCode
    });
    return {
      success: false,
      error: typedError.userMessage || typedError.message,
      errorCode: typedError.context?.errorCode
    };
  }
}

export async function closeTicket(channel, closer, reason = 'No reason provided') {
  try {
    const ticketData = await getTicketData(channel.guild.id, channel.id);
    if (!ticketData) {
      return { success: false, error: 'This is not a ticket channel' };
    }

    const config = await getGuildConfig(channel.client, channel.guild.id);
    const dmOnClose = config.dmOnClose !== false;
    const closedCategoryId = config.ticketClosedCategoryId || null;
    let movedToClosedCategory = false;

    ticketData.status = 'closed';
    ticketData.closedBy = closer.id;
    ticketData.closedAt = new Date().toISOString();
    ticketData.closeReason = reason;

    await saveTicketData(channel.guild.id, channel.id, ticketData);

    if (closedCategoryId && channel.parentId !== closedCategoryId) {
      const closedCategory = channel.guild.channels.cache.get(closedCategoryId)
        || await channel.guild.channels.fetch(closedCategoryId).catch(() => null);

      if (closedCategory?.type === ChannelType.GuildCategory) {
        try {
          await channel.setParent(closedCategoryId, { lockPermissions: false });
          movedToClosedCategory = true;
        } catch (moveError) {
            logger.warn(`Could not move ticket ${channel.id} to closed category ${closedCategoryId}: ${moveError.message}`);
        }
      } else {
        logger.warn(`Configured closed category is invalid for guild ${channel.guild.id}: ${closedCategoryId}`);
      }
    }

    if (dmOnClose) {
      try {
        const ticketCreator = await channel.client.users.fetch(ticketData.userId).catch(() => null);
        if (ticketCreator) {
          const resolutionTime = ticketData.claimedAt
            ? Math.floor((Date.now() - new Date(ticketData.claimedAt).getTime()) / 60000)
            : null;
          const resolutionTimeDisplay = resolutionTime !== null
            ? `\n**Resolution Time:** ${resolutionTime} minutes`
            : '';

          const dmEmbed = createEmbed({
            title: '🎫 Your Ticket Has Been Closed',
            description: `Your ticket **#${channel.name}** has been closed.\n\n**Reason:** ${reason}\n**Closed by:** ${closer.tag}${resolutionTimeDisplay}\n**Closed at:** <t:${Math.floor(Date.now() / 1000)}:F>\n\nThank you for using our support system! If you have any further questions, feel free to create a new ticket.`,
            color: '#e74c3c',
            footer: { text: `Ticket ID: ${ticketData.id}` },
            thumbnail: closer.displayAvatarURL ? { url: closer.displayAvatarURL({ size: 64 }) } : undefined,
          });

          await ticketCreator.send({ embeds: [dmEmbed] });

          try {
            const feedbackEmbed = createEmbed({
              title: '⭐ How was your support experience?',
              description: `We'd love to know how we did with ticket **#${channel.name}**.\nSelect a rating below — it only takes a second!`,
              color: '#F1C40F',
              footer: { text: 'Your feedback helps us improve.' },
            });

            const base = `ticket_feedback:${channel.guild.id}:${channel.id}`;
            const starsRow = new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId(`${base}:1`).setLabel('⭐').setStyle(ButtonStyle.Secondary),
              new ButtonBuilder().setCustomId(`${base}:2`).setLabel('⭐⭐').setStyle(ButtonStyle.Secondary),
              new ButtonBuilder().setCustomId(`${base}:3`).setLabel('⭐⭐⭐').setStyle(ButtonStyle.Secondary),
              new ButtonBuilder().setCustomId(`${base}:4`).setLabel('⭐⭐⭐⭐').setStyle(ButtonStyle.Secondary),
              new ButtonBuilder().setCustomId(`${base}:5`).setLabel('⭐⭐⭐⭐⭐').setStyle(ButtonStyle.Secondary),
            );
            const declineRow = new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`ticket_feedback_decline:${channel.guild.id}:${channel.id}`)
                .setLabel('No thanks')
                .setStyle(ButtonStyle.Secondary),
            );

            await ticketCreator.send({
              embeds: [feedbackEmbed],
              components: [starsRow, declineRow],
            });
          } catch (feedbackError) {
            logger.warn(`Could not send feedback survey to ticket creator ${ticketData.userId}: ${feedbackError.message}`);
          }
        }
      } catch (dmError) {
          logger.warn(`Could not send DM to ticket creator ${ticketData.userId}: ${dmError.message}`);
      }
    }

    try {
      const user = await channel.guild.members.fetch(ticketData.userId).catch(() => null);
      const targetUser = user?.user || await channel.client.users.fetch(ticketData.userId).catch(() => null);

      if (targetUser) {
        const overwrite = channel.permissionOverwrites.cache.get(ticketData.userId);
        if (overwrite) {
          await overwrite.edit({
            ViewChannel: false,
            SendMessages: false,
          });
        } else {
          await channel.permissionOverwrites.create(targetUser, {
            ViewChannel: false,
            SendMessages: false,
          });
        }
      }
    } catch (permError) {
        logger.warn(`Could not update user permissions for closed ticket: ${permError.message}`);
    }

    const messages = await channel.messages.fetch();
    const ticketMessage = messages.find(m =>
      m.embeds.length > 0 &&
      m.embeds[0].title?.includes('Ticket #')
    );

    if (ticketMessage) {
      const embed = ticketMessage.embeds[0];
      const statusField = embed.fields?.find(f => f.name.includes('Status'));

      if (statusField) {
        statusField.value = '🔴 Closed';
      }

      const updatedEmbed = createEmbed({
        title: embed.title || 'Ticket',
        description: embed.description || 'Ticket discussion',
        color: '#e74c3c',
        fields: embed.fields || [],
        footer: embed.footer
      });

      await ticketMessage.edit({
        embeds: [updatedEmbed],
components: []
      });
    }

    const closeEmbed = createEmbed({
      title: '🔒 Ticket Closed',
      description: `This ticket has been closed by ${closer}.\n\n**Reason:** ${reason}${dmOnClose ? '\n\n📩 A DM has been sent to the ticket creator.' : ''}`,
      color: '#e74c3c',
      footer: { text: `Ticket ID: ${ticketData.id} | Use buttons below to manage` },
      timestamp: new Date().toISOString(),
    });

    const controlRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ticket_reopen')
        .setLabel('Reopen')
        .setStyle(ButtonStyle.Success)
        .setEmoji('🔓'),
      new ButtonBuilder()
        .setCustomId('ticket_delete')
        .setLabel('Delete')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🗑️')
    );

    await channel.send({ embeds: [closeEmbed], components: [controlRow] });

    await logTicketEvent({
      client: channel.client,
      guildId: channel.guild.id,
      event: {
        type: 'close',
        ticketId: channel.id,
        ticketNumber: ticketData.id,
        userId: ticketData.userId,
        executorId: closer.id,
        reason: reason,
        metadata: {
          dmSent: dmOnClose,
          closedAt: ticketData.closedAt,
          movedToClosedCategory
        }
      }
    });

    return { success: true, ticketData };

  } catch (error) {
    const typedError = ensureTypedServiceError(error, {
      service: 'ticketService',
      operation: 'closeTicket',
      message: 'Ticket operation failed: closeTicket',
      userMessage: 'Failed to close ticket. Please try again in a moment.',
      context: { guildId: channel?.guild?.id, channelId: channel?.id, closerId: closer?.id }
    });
    logger.error('Error closing ticket:', {
      guildId: channel?.guild?.id,
      channelId: channel?.id,
      userId: closer?.id,
      error: typedError.message,
      errorCode: typedError.context?.errorCode
    });
    return {
      success: false,
      error: typedError.userMessage || typedError.message,
      errorCode: typedError.context?.errorCode
    };
  }
}

export async function claimTicket(channel, claimer) {
  try {
    const ticketData = await getTicketData(channel.guild.id, channel.id);
    if (!ticketData) {
      return { success: false, error: 'This is not a ticket channel' };
    }

    if (ticketData.claimedBy) {
      return {
        success: false,
        error: `This ticket is already claimed by <@${ticketData.claimedBy}>`
      };
    }

    ticketData.claimedBy = claimer.id;
    ticketData.claimedAt = new Date().toISOString();
    ticketData.lastActivityAt = new Date().toISOString();

    await saveTicketData(channel.guild.id, channel.id, ticketData);

    const messages = await channel.messages.fetch();
    const ticketMessage = messages.find(m =>
      m.embeds.length > 0 &&
      m.embeds[0].title?.includes('Ticket #')
    );

    if (ticketMessage) {
      const embed = ticketMessage.embeds[0];
      const claimedField = embed.fields?.find(f => f.name.includes('Claimed'));

      if (claimedField) {
        claimedField.value = claimer.toString();
      }

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('ticket_close')
          .setLabel('Close')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('🔒'),
        new ButtonBuilder()
          .setCustomId('ticket_claim')
          .setLabel('Claimed')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('✅')
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId('ticket_pin')
          .setLabel('Pin')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('📌'),
        new ButtonBuilder()
          .setCustomId('ticket_note')
          .setLabel('Note')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('📝')
      );

      await ticketMessage.edit({
        embeds: [embed],
        components: [row]
      });
    }

    const claimEmbed = createEmbed({
      title: '✅ Ticket Claimed',
      description: `${claimer} has claimed this ticket and will be assisting you!`,
      color: '#2ecc71',
      fields: [
        { name: 'Claimed At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
        { name: 'Staff Member', value: claimer.toString(), inline: true },
      ],
      thumbnail: claimer.displayAvatarURL ? { url: claimer.displayAvatarURL({ size: 64 }) } : undefined,
    });

    const unclaimRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ticket_unclaim')
        .setLabel('Unclaim')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🔓')
    );

    const claimStatusMessage = messages.find(m =>
      m.embeds.length > 0 &&
      (m.embeds[0].title?.includes('Ticket Claimed') || m.embeds[0].title?.includes('Ticket Unclaimed'))
    );

    if (claimStatusMessage) {
      await claimStatusMessage.edit({ embeds: [claimEmbed], components: [unclaimRow] });
    } else {
      await channel.send({ embeds: [claimEmbed], components: [unclaimRow] });
    }

    if (ticketData.watchers && ticketData.watchers.length > 0) {
      await notifyWatchers(channel, ticketData, 'claimed', claimer);
    }

    await logTicketEvent({
      client: channel.client,
      guildId: channel.guild.id,
      event: {
        type: 'claim',
        ticketId: channel.id,
        ticketNumber: ticketData.id,
        userId: ticketData.userId,
        executorId: claimer.id,
        metadata: {
          claimedAt: ticketData.claimedAt
        }
      }
    });

    return { success: true, ticketData };

  } catch (error) {
    const typedError = ensureTypedServiceError(error, {
      service: 'ticketService',
      operation: 'claimTicket',
      message: 'Ticket operation failed: claimTicket',
      userMessage: 'Failed to claim ticket. Please try again in a moment.',
      context: { guildId: channel?.guild?.id, channelId: channel?.id, claimerId: claimer?.id }
    });
    logger.error('Error claiming ticket:', {
      guildId: channel?.guild?.id,
      channelId: channel?.id,
      userId: claimer?.id,
      error: typedError.message,
      errorCode: typedError.context?.errorCode
    });
    return {
      success: false,
      error: typedError.userMessage || typedError.message,
      errorCode: typedError.context?.errorCode
    };
  }
}

export async function reopenTicket(channel, reopener) {
  try {
    const ticketData = await getTicketData(channel.guild.id, channel.id);
    if (!ticketData) {
      return { success: false, error: 'This is not a ticket channel' };
    }

    if (ticketData.status !== 'closed') {
      return {
        success: false,
        error: 'This ticket is not currently closed'
      };
    }

    const config = await getGuildConfig(channel.client, channel.guild.id);
    const openCategoryId = config.ticketCategoryId || null;
    let movedToOpenCategory = false;
    let openCategoryMoveFailed = false;

    ticketData.status = 'open';
    ticketData.closedBy = null;
    ticketData.closedAt = null;
    ticketData.closeReason = null;
    ticketData.reopenedBy = reopener.id;
    ticketData.reopenedAt = new Date().toISOString();
    ticketData.lastActivityAt = new Date().toISOString();

    await saveTicketData(channel.guild.id, channel.id, ticketData);

    if (openCategoryId && channel.parentId !== openCategoryId) {
      const openCategory = channel.guild.channels.cache.get(openCategoryId)
        || await channel.guild.channels.fetch(openCategoryId).catch(() => null);

      if (openCategory?.type === ChannelType.GuildCategory) {
        try {
          await channel.setParent(openCategoryId, { lockPermissions: false });
          movedToOpenCategory = true;
        } catch (moveError) {
          openCategoryMoveFailed = true;
          logger.warn(`Could not move reopened ticket ${channel.id} to open category ${openCategoryId}: ${moveError.message}`);
        }
      } else {
        openCategoryMoveFailed = true;
        logger.warn(`Configured open ticket category is invalid for guild ${channel.guild.id}: ${openCategoryId}`);
      }
    }

    try {
      const user = await channel.guild.members.fetch(ticketData.userId).catch(() => null);
      if (user) {
        await channel.permissionOverwrites.create(user, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true,
          AttachFiles: true
        });
      }
    } catch (error) {
      logger.warn(`Could not restore access for user ${ticketData.userId}:`, error.message);
    }

    const messages = await channel.messages.fetch();
    const ticketMessage = messages.find(m =>
      m.embeds.length > 0 &&
      m.embeds[0].title?.includes('Ticket #')
    );

    if (ticketMessage) {
      const embed = ticketMessage.embeds[0];
      const statusField = embed.fields?.find(f => f.name.includes('Status'));

      if (statusField) {
        statusField.value = '🟢 Open';
      }

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('ticket_close')
          .setLabel('Close')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('🔒'),
        new ButtonBuilder()
          .setCustomId('ticket_claim')
          .setLabel(ticketData.claimedBy ? 'Claimed' : 'Claim')
          .setStyle(ticketData.claimedBy ? ButtonStyle.Secondary : ButtonStyle.Primary)
          .setEmoji('🙋')
          .setDisabled(!!ticketData.claimedBy),
        new ButtonBuilder()
          .setCustomId('ticket_pin')
          .setLabel('Pin')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('📌'),
        new ButtonBuilder()
          .setCustomId('ticket_note')
          .setLabel('Note')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('📝')
      );

      await ticketMessage.edit({
        embeds: [embed],
        components: [row]
      });
    }

    const reopenEmbed = createEmbed({
      title: '🔓 Ticket Reopened',
      description: `${reopener} has reopened this ticket!`,
      color: '#2ecc71',
      fields: [
        { name: 'Reopened At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
      ],
      footer: { text: `Reopened by ${reopener.tag}` },
    });

    const closeStatusMessage = messages.find(m =>
      m.embeds.length > 0 &&
      m.embeds[0].title?.includes('Ticket Closed') &&
      m.components.length > 0 &&
      m.components[0].components.some(c => c.customId === 'ticket_reopen')
    );

    if (closeStatusMessage) {
      await closeStatusMessage.edit({ embeds: [reopenEmbed], components: [] });
    } else {
      await channel.send({ embeds: [reopenEmbed] });
    }

    if (ticketData.watchers && ticketData.watchers.length > 0) {
      await notifyWatchers(channel, ticketData, 'reopened', reopener);
    }

    return {
      success: true,
      ticketData,
      movedToOpenCategory,
      openCategoryMoveFailed
    };

  } catch (error) {
    const typedError = ensureTypedServiceError(error, {
      service: 'ticketService',
      operation: 'reopenTicket',
      message: 'Ticket operation failed: reopenTicket',
      userMessage: 'Failed to reopen ticket. Please try again in a moment.',
      context: { guildId: channel?.guild?.id, channelId: channel?.id, reopenerId: reopener?.id }
    });
    logger.error('Error reopening ticket:', {
      guildId: channel?.guild?.id,
      channelId: channel?.id,
      userId: reopener?.id,
      error: typedError.message,
      errorCode: typedError.context?.errorCode
    });
    return {
      success: false,
      error: typedError.userMessage || typedError.message,
      errorCode: typedError.context?.errorCode
    };
  }
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function generateTranscript(channel, ticketData = null) {
  try {
    logger.debug('Generating enhanced transcript for channel', {
      channelId: channel.id,
      channelName: channel.name
    });

    const messages = [];
    let before = undefined;
    let batch;
    do {
      batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
      if (batch.size === 0) break;
      messages.push(...batch.values());
      before = batch.last()?.id;
    } while (batch.size === 100);

    messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

    const escape = (str) =>
      String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    function formatEmbed(embed) {
      let html = '<div class="embed">';
      if (embed.color) {
        const colorHex = typeof embed.color === 'number' ? `#${embed.color.toString(16).padStart(6, '0')}` : embed.color;
        html += `<div class="embed-color-bar" style="background-color: ${escape(colorHex)};"></div>`;
      }
      html += '<div class="embed-content">';
      if (embed.title) html += `<div class="embed-title">${escape(embed.title)}</div>`;
      if (embed.description) html += `<div class="embed-description">${escape(embed.description)}</div>`;
      if (embed.fields && embed.fields.length > 0) {
        html += '<div class="embed-fields">';
        for (const field of embed.fields) {
          html += `<div class="embed-field${field.inline ? ' inline' : ''}">`;
          html += `<div class="embed-field-name">${escape(field.name)}</div>`;
          html += `<div class="embed-field-value">${escape(field.value)}</div>`;
          html += '</div>';
        }
        html += '</div>';
      }
      if (embed.footer?.text) html += `<div class="embed-footer">${escape(embed.footer.text)}</div>`;
      html += '</div></div>';
      return html;
    }

    function formatAttachment(attachment) {
      const isImage = /\.(png|jpg|jpeg|gif|webp)$/i.test(attachment.url);
      const isVideo = /\.(mp4|webm|mov)$/i.test(attachment.url);
      const isAudio = /\.(mp3|wav|ogg)$/i.test(attachment.url);

      if (isImage) {
        return `<div class="attachment image-attachment"><a href="${escape(attachment.url)}" target="_blank"><img src="${escape(attachment.url)}" alt="${escape(attachment.name)}" loading="lazy"></a></div>`;
      } else if (isVideo) {
        return `<div class="attachment video-attachment"><video controls src="${escape(attachment.url)}"></video></div>`;
      } else if (isAudio) {
        return `<div class="attachment audio-attachment"><audio controls src="${escape(attachment.url)}"></audio></div>`;
      } else {
        return `<div class="attachment file-attachment"><a href="${escape(attachment.url)}" target="_blank">📎 ${escape(attachment.name)}${attachment.size ? ` (${Math.round(attachment.size / 1024)} KB)` : ''}</a></div>`;
      }
    }

    function formatSticker(sticker) {
      return `<div class="sticker"><img src="${escape(sticker.url)}" alt="${escape(sticker.name)}" title="${escape(sticker.name)}"></div>`;
    }

    const messageRows = messages.map((msg) => {
      const ts = new Date(msg.createdTimestamp).toISOString().replace('T', ' ').slice(0, 19);
      const authorName = escape(msg.author?.tag ?? msg.author?.username ?? 'Unknown');
      const authorAvatar = msg.author?.displayAvatarURL?.({ size: 32 }) || msg.author?.avatarURL?.({ size: 32 }) || '';
      const authorId = msg.author?.id || 'unknown';

      let contentHtml = '';
      if (msg.content) {
        contentHtml += `<div class="message-content">${escape(msg.content)}</div>`;
      }

      if (msg.embeds && msg.embeds.length > 0) {
        contentHtml += '<div class="embeds">';
        for (const embed of msg.embeds) {
          contentHtml += formatEmbed(embed);
        }
        contentHtml += '</div>';
      }

      if (msg.attachments && msg.attachments.size > 0) {
        contentHtml += '<div class="attachments">';
        for (const attachment of msg.attachments.values()) {
          contentHtml += formatAttachment(attachment);
        }
        contentHtml += '</div>';
      }

      if (msg.stickers && msg.stickers.size > 0) {
        contentHtml += '<div class="stickers">';
        for (const sticker of msg.stickers.values()) {
          contentHtml += formatSticker(sticker);
        }
        contentHtml += '</div>';
      }

      if (!contentHtml) {
        contentHtml = '<div class="message-content system-message">[System Message]</div>';
      }

      return `<div class="message" data-author-id="${authorId}">
        <div class="message-header">
          <img class="avatar" src="${escape(authorAvatar)}" alt="${authorName}" loading="lazy">
          <span class="author" title="${authorName}">${authorName}</span>
          <span class="timestamp">${ts}</span>
        </div>
        <div class="message-body">${contentHtml}</div>
      </div>`;
    }).join('\n');

    const ticketCreator = ticketData?.userId
      ? messages.find(m => m.author?.id === ticketData.userId)?.author
      : null;
    const claimer = ticketData?.claimedBy
      ? messages.find(m => m.author?.id === ticketData.claimedBy)?.author
      : null;

    const statsHtml = `
      <div class="stats-grid">
        <div class="stat-box"><div class="stat-value">${messages.length}</div><div class="stat-label">Messages</div></div>
        <div class="stat-box"><div class="stat-value">${new Set(messages.map(m => m.author?.id).filter(Boolean)).size}</div><div class="stat-label">Participants</div></div>
        <div class="stat-box"><div class="stat-value">${messages.filter(m => m.attachments?.size > 0).length}</div><div class="stat-label">Attachments</div></div>
      </div>`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Transcript – #${escape(channel.name)}</title>
<style>
*{box-sizing:border-box}
body{font-family:'Segoe UI',Tahoma,Helvetica,Arial,sans-serif;background:linear-gradient(135deg,#36393f 0%,#2f3136 100%);color:#dcddde;margin:0;padding:20px;min-height:100vh}
.header{background:#2f3136;border-radius:8px;padding:20px;margin-bottom:20px;box-shadow:0 2px 8px rgba(0,0,0,0.3)}
h1{color:#fff;font-size:1.5rem;margin:0 0 8px 0}
.meta{color:#72767d;font-size:0.85rem}
.stats-grid{display:flex;gap:15px;margin-top:15px;flex-wrap:wrap}
.stat-box{background:#202225;border-radius:6px;padding:12px 20px;text-align:center;min-width:80px}
.stat-value{font-size:1.5rem;font-weight:bold;color:#fff}
.stat-label{font-size:0.75rem;color:#72767d;text-transform:uppercase}
.ticket-info{background:rgba(${'0,0,0,0.2'});border-radius:6px;padding:12px;margin-top:12px;font-size:0.85rem}
.ticket-info span{margin-right:15px;color:#7289da}
.messages-container{background:#36393f;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.3)}
.message{padding:12px 16px;border-bottom:1px solid #40444b;display:flex;flex-direction:column}
.message:hover{background:rgba(0,0,0,0.1)}
.message:last-child{border-bottom:none}
.message-header{display:flex;align-items:center;gap:10px;margin-bottom:8px}
.avatar{width:40px;height:40px;border-radius:50%;object-fit:cover;background:#2f3136}
.author{color:#7289da;font-weight:600;font-size:0.95rem}
.timestamp{color:#72767d;font-size:0.8rem;margin-left:auto}
.message-body{margin-left:50px}
.message-content{color:#dcddde;line-height:1.5;word-break:break-word}
.system-message{color:#72767d;font-style:italic}
.embeds{margin-top:10px;display:flex;flex-direction:column;gap:10px}
.embed{background:#2f3136;border-radius:4px;display:flex;overflow:hidden;max-width:520px}
.embed-color-bar{width:4px;flex-shrink:0}
.embed-content{padding:10px 12px;flex:1;min-width:0}
.embed-title{color:#fff;font-weight:600;font-size:0.95rem;margin-bottom:6px}
.embed-description{color:#dcddde;font-size:0.9rem;line-height:1.4}
.embed-fields{margin-top:8px;display:flex;flex-wrap:wrap;gap:8px}
.embed-field{flex:1;min-width:150px}
.embed-field.inline{flex:1 1 auto;min-width:100px}
.embed-field-name{color:#fff;font-weight:600;font-size:0.85rem;margin-bottom:2px}
.embed-field-value{color:#dcddde;font-size:0.85rem}
.embed-footer{color:#72767d;font-size:0.8rem;margin-top:8px}
.attachments{margin-top:10px;display:flex;flex-wrap:wrap;gap:8px}
.attachment{background:rgba(0,0,0,0.2);border-radius:4px;overflow:hidden}
.attachment a{color:#00b0f4;text-decoration:none}
.attachment a:hover{text-decoration:underline}
.image-attachment img{max-width:300px;max-height:300px;display:block;border-radius:4px}
.video-attachment video{max-width:400px;max-height:300px;border-radius:4px}
.audio-attachment audio{width:300px}
.file-attachment{padding:8px 12px}
.stickers{margin-top:8px}
.sticker img{width:120px;height:120px;object-fit:contain;border-radius:8px}
.footer{margin-top:20px;text-align:center;color:#72767d;font-size:0.8rem}
@media(max-width:600px){.message-body{margin-left:0}.stats-grid{flex-direction:column}}
</style>
</head>
<body>
<div class="header">
<h1>📜 Transcript – #${escape(channel.name)}</h1>
<p class="meta">${messages.length} message(s) | Exported on ${new Date().toUTCString()}</p>
${statsHtml}
${ticketData ? `<div class="ticket-info">
<span>Ticket ID: ${escape(ticketData.id)}</span>
<span>Created: ${ticketData.createdAt ? new Date(ticketData.createdAt).toLocaleString() : 'Unknown'}</span>
${ticketData.claimedBy ? `<span>Claimed by: ${escape(ticketData.claimedBy)}</span>` : ''}
${ticketData.closedAt ? `<span>Closed: ${new Date(ticketData.closedAt).toLocaleString()}</span>` : ''}
</div>` : ''}
</div>
<div class="messages-container">
${messageRows}
</div>
<div class="footer">
Generated by TitanBot Ticket System | ${new Date().toISOString()}
</div>
</body>
</html>`;

    const buffer = Buffer.from(html, 'utf8');
    const attachment = new AttachmentBuilder(buffer, { name: `transcript-${channel.name}-${Date.now()}.html` });

    logger.info('Successfully generated enhanced transcript', {
      channelId: channel.id,
      channelName: channel.name,
      messageCount: messages.length,
      size: buffer.length
    });

    return attachment;
  } catch (error) {
    logger.error('Failed to generate transcript:', {
      channelId: channel.id,
      channelName: channel.name,
      errorMessage: error.message,
      errorName: error.name,
      errorStack: error.stack
    });
    return null;
  }
}

export async function deleteTicket(channel, deleter) {
  try {
    const ticketData = await getTicketData(channel.guild.id, channel.id);
    if (!ticketData) {
      return { success: false, error: 'This is not a ticket channel' };
    }

    const deleteEmbed = createEmbed({
      title: '🗑️ Ticket Deletion',
      description: `This ticket will be permanently deleted in ${TICKET_DELETE_DELAY_SECONDS} seconds.\nA transcript is being generated...`,
      color: '#e74c3c',
      footer: { text: `Ticket ID: ${ticketData.id}` },
    });

    await channel.send({ embeds: [deleteEmbed] });

    await logTicketEvent({
      client: channel.client,
      guildId: channel.guild.id,
      event: {
        type: 'delete',
        ticketId: channel.id,
        ticketNumber: ticketData.id,
        userId: ticketData.userId,
        executorId: deleter.id,
        metadata: {
          deletedAt: new Date().toISOString()
        }
      }
    });

    setTimeout(async () => {
      try {
        logger.debug('Starting ticket deletion process', {
          channelId: channel.id,
          ticketId: ticketData.id
        });

        let attachment = null;
        try {
          attachment = await generateTranscript(channel, ticketData);
          if (attachment) {
            logger.info('Transcript generated successfully', {
              channelId: channel.id,
              ticketNumber: ticketData.id
            });
          } else {
            logger.warn('Transcript generation returned null', {
              channelId: channel.id,
              ticketNumber: ticketData.id
            });
          }
        } catch (transcriptError) {
          logger.error('Error during transcript generation', {
            channelId: channel.id,
            ticketNumber: ticketData.id,
            error: transcriptError.message
          });
        }

        if (attachment) {
          try {
            const guildConfig = await getGuildConfig(channel.client, channel.guild.id);
            if (!guildConfig.ticketTranscriptChannelId) {
              logger.warn('No transcript channel configured', {
                channelId: channel.id,
                ticketNumber: ticketData.id
              });
            } else {
              const transcriptChannel = await channel.client.channels.fetch(guildConfig.ticketTranscriptChannelId).catch(() => null);

              if (!transcriptChannel) {
                logger.error('Could not fetch transcript channel', {
                  channelId: channel.id,
                  transcriptChannelId: guildConfig.ticketTranscriptChannelId
                });
              } else if (!transcriptChannel.isSendable?.()) {
                logger.error('Transcript channel is not sendable', {
                  channelId: channel.id,
                  transcriptChannelId: transcriptChannel.id
                });
              } else {
                const priorityInfo = PRIORITY_MAP[ticketData.priority] || PRIORITY_MAP.none;
                const duration = ticketData.createdAt
                  ? Math.round((Date.now() - new Date(ticketData.createdAt).getTime()) / 60000)
                  : null;

                const transcriptEmbed = new EmbedBuilder()
                  .setTitle('📜 Ticket Transcript')
                  .setDescription(`**Ticket:** #${channel.name}\n**Status:** Deleted`)
                  .setColor(priorityInfo.color)
                  .addFields(
                    { name: 'Ticket ID', value: `\`${ticketData.id}\``, inline: true },
                    { name: 'Creator', value: `<@${ticketData.userId}>`, inline: true },
                    { name: 'Priority', value: `${priorityInfo.emoji} ${priorityInfo.label}`, inline: true },
                    { name: 'Deleted By', value: `<@${deleter.id}>`, inline: true },
                    { name: 'Deleted At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
                    { name: 'Duration', value: duration !== null ? `${duration} min` : 'Unknown', inline: true }
                  );

                if (ticketData.claimedBy) {
                  transcriptEmbed.addFields(
                    { name: 'Claimed By', value: `<@${ticketData.claimedBy}>`, inline: true }
                  );
                }
                if (ticketData.tags && ticketData.tags.length > 0) {
                  transcriptEmbed.addFields(
                    { name: 'Tags', value: ticketData.tags.map(t => `\`${t}\``).join(', '), inline: true }
                  );
                }

                transcriptEmbed.setFooter({
                  text: `Deleted by: ${deleter.tag}`,
                  iconURL: deleter.displayAvatarURL?.()
                });

                await transcriptChannel.send({
                  embeds: [transcriptEmbed],
                  files: [attachment]
                });

                logger.info('Transcript sent successfully', {
                  channelId: channel.id,
                  ticketNumber: ticketData.id,
                  transcriptChannelId: transcriptChannel.id
                });
              }
            }
          } catch (sendError) {
            logger.error('Failed to send transcript to channel:', {
              channelId: channel.id,
              ticketNumber: ticketData.id,
              error: sendError.message
            });
          }
        }

        try {
          await channel.delete('Ticket deleted permanently');
          await deleteTicketData(channel.guild.id, channel.id);
          logger.info('Channel deleted', {
            channelId: channel.id,
            channelName: channel.name,
            ticketNumber: ticketData.id
          });
        } catch (deleteError) {
          logger.error('Failed to delete ticket channel:', {
            channelId: channel.id,
            channelName: channel.name,
            ticketNumber: ticketData.id,
            errorMessage: deleteError.message,
            errorCode: deleteError.code,
            errorName: deleteError.name
          });
        }
      } catch (error) {
        logger.error('Unexpected error during ticket deletion:', {
          channelId: channel.id,
          channelName: channel?.name,
          ticketNumber: ticketData?.id,
          errorMessage: error.message,
          errorName: error.name,
          errorStack: error.stack
        });
      }
    }, TICKET_DELETE_DELAY_MS);

    return { success: true, ticketData };

  } catch (error) {
    const typedError = ensureTypedServiceError(error, {
      service: 'ticketService',
      operation: 'deleteTicket',
      message: 'Ticket operation failed: deleteTicket',
      userMessage: 'Failed to delete ticket. Please try again in a moment.',
      context: { guildId: channel?.guild?.id, channelId: channel?.id, deleterId: deleter?.id }
    });
    logger.error('Error deleting ticket:', {
      guildId: channel?.guild?.id,
      channelId: channel?.id,
      userId: deleter?.id,
      error: typedError.message,
      errorCode: typedError.context?.errorCode
    });
    return {
      success: false,
      error: typedError.userMessage || typedError.message,
      errorCode: typedError.context?.errorCode
    };
  }
}

export async function unclaimTicket(channel, unclaimer) {
  try {
    const ticketData = await getTicketData(channel.guild.id, channel.id);
    if (!ticketData) {
      return { success: false, error: 'This is not a ticket channel' };
    }

    if (!ticketData.claimedBy) {
      return {
        success: false,
        error: 'This ticket is not currently claimed'
      };
    }

    if (ticketData.claimedBy !== unclaimer.id && !unclaimer.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return {
        success: false,
        error: 'You can only unclaim your own tickets or need Manage Channels permission.'
      };
    }

    const previousClaimer = ticketData.claimedBy;
    ticketData.claimedBy = null;
    ticketData.claimedAt = null;
    ticketData.lastActivityAt = new Date().toISOString();

    await saveTicketData(channel.guild.id, channel.id, ticketData);

    const messages = await channel.messages.fetch();
    const ticketMessage = messages.find(m =>
      m.embeds.length > 0 &&
      m.embeds[0].title?.includes('Ticket #')
    );

    if (ticketMessage) {
      const embed = ticketMessage.embeds[0];
      const claimedField = embed.fields?.find(f => f.name.includes('Claimed'));

      if (claimedField) {
        claimedField.value = 'Unclaimed';
      }

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('ticket_close')
          .setLabel('Close')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('🔒'),
        new ButtonBuilder()
          .setCustomId('ticket_claim')
          .setLabel('Claim')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('🙋'),
        new ButtonBuilder()
          .setCustomId('ticket_pin')
          .setLabel('Pin')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('📌'),
        new ButtonBuilder()
          .setCustomId('ticket_note')
          .setLabel('Note')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('📝')
      );

      await ticketMessage.edit({
        embeds: [embed],
        components: [row]
      });
    }

    const claimMessage = messages.find(m =>
      m.embeds.length > 0 &&
      (m.embeds[0].title?.includes('Ticket Claimed') || m.embeds[0].title?.includes('Ticket Unclaimed'))
    );

    if (claimMessage) {
      const unclaimEmbed = createEmbed({
        title: '🔓 Ticket Unclaimed',
        description: `${unclaimer} has unclaimed this ticket. It is now available for other staff to claim.`,
        color: '#f39c12',
        timestamp: new Date().toISOString(),
      });

      await claimMessage.edit({
        embeds: [unclaimEmbed],
        components: []
      });
    } else {
      const unclaimEmbed = createEmbed({
        title: '🔓 Ticket Unclaimed',
        description: `${unclaimer} has unclaimed this ticket. It is now available for other staff to claim.`,
        color: '#f39c12',
      });

      await channel.send({ embeds: [unclaimEmbed] });
    }

    await logTicketEvent({
      client: channel.client,
      guildId: channel.guild.id,
      event: {
        type: 'unclaim',
        ticketId: channel.id,
        ticketNumber: ticketData.id,
        userId: ticketData.userId,
        executorId: unclaimer.id,
        metadata: {
          previousClaimer: previousClaimer
        }
      }
    });

    return { success: true, ticketData };

  } catch (error) {
    const typedError = ensureTypedServiceError(error, {
      service: 'ticketService',
      operation: 'unclaimTicket',
      message: 'Ticket operation failed: unclaimTicket',
      userMessage: 'Failed to unclaim ticket. Please try again in a moment.',
      context: { guildId: channel?.guild?.id, channelId: channel?.id, unclaimerId: unclaimer?.id }
    });
    logger.error('Error unclaiming ticket:', {
      guildId: channel?.guild?.id,
      channelId: channel?.id,
      userId: unclaimer?.id,
      error: typedError.message,
      errorCode: typedError.context?.errorCode
    });
    return {
      success: false,
      error: typedError.userMessage || typedError.message,
      errorCode: typedError.context?.errorCode
    };
  }
}

async function getNextTicketNumber(guildId) {
  return await incrementTicketCounter(guildId);
}

export async function updateTicketPriority(channel, priority, updater) {
  try {
    const ticketData = await getTicketData(channel.guild.id, channel.id);
    if (!ticketData) {
      return { success: false, error: 'This is not a ticket channel' };
    }

    const priorityInfo = PRIORITY_MAP[priority];
    if (!priorityInfo) {
      return { success: false, error: 'Invalid priority level' };
    }

    const previousPriority = ticketData.priority;
    ticketData.priority = priority;
    ticketData.priorityUpdatedBy = updater.id;
    ticketData.priorityUpdatedAt = new Date().toISOString();
    ticketData.lastActivityAt = new Date().toISOString();

    await saveTicketData(channel.guild.id, channel.id, ticketData);

    const currentName = channel.name;
    const priorityEmojis = [...new Set(Object.values(PRIORITY_MAP).map((item) => item.emoji).filter(Boolean))];
    const escapedPriorityEmojis = priorityEmojis.map((emoji) => emoji.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const cleanName = escapedPriorityEmojis.length > 0
      ? currentName.replace(new RegExp(`(?:${escapedPriorityEmojis.join('|')})\\s*`, 'g'), '').trim()
      : currentName.trim();
    const newName = priority === 'none' ? cleanName : `${priorityInfo.emoji} ${cleanName}`;

    if (newName && newName !== currentName) {
      try {
        await channel.setName(newName);
      } catch (nameError) {
        logger.warn(`Could not update channel name for priority: ${nameError.message}`);
      }
    }

    const messages = await channel.messages.fetch();
    const ticketMessage = messages.find(m =>
      m.embeds.length > 0 &&
      m.embeds[0].title?.includes('Ticket #')
    );

    if (ticketMessage) {
      const embed = ticketMessage.embeds[0];
      const description = embed.description || '';
      const descriptionWithoutPriority = description.split('\n**Priority:**')[0];

      const updatedEmbed = createEmbed({
        title: embed.title || 'Ticket',
        description: descriptionWithoutPriority + `\n**Priority:** ${priorityInfo.emoji} ${priorityInfo.label}`,
        color: priorityInfo.color,
        fields: embed.fields || [],
        footer: embed.footer
      });

      await ticketMessage.edit({ embeds: [updatedEmbed] });
    }

    const updateEmbed = createEmbed({
      title: '📊 Priority Updated',
      description: `Ticket priority changed to **${priorityInfo.emoji} ${priorityInfo.label}**\nUpdated by ${updater}`,
      color: priorityInfo.color,
      fields: previousPriority !== priority ? [
        { name: 'Previous', value: `${PRIORITY_MAP[previousPriority]?.emoji || '⚪'} ${PRIORITY_MAP[previousPriority]?.label || 'None'}`, inline: true },
        { name: 'New', value: `${priorityInfo.emoji} ${priorityInfo.label}`, inline: true },
      ] : undefined,
    });

    await channel.send({ embeds: [updateEmbed] });

    await logTicketEvent({
      client: channel.client,
      guildId: channel.guild.id,
      event: {
        type: 'priority',
        ticketId: channel.id,
        ticketNumber: ticketData.id,
        userId: ticketData.userId,
        executorId: updater.id,
        priority: priority,
        metadata: {
          previousPriority: previousPriority,
          updatedAt: ticketData.priorityUpdatedAt
        }
      }
    });

    return { success: true, ticketData };

  } catch (error) {
    const typedError = ensureTypedServiceError(error, {
      service: 'ticketService',
      operation: 'updateTicketPriority',
      message: 'Ticket operation failed: updateTicketPriority',
      userMessage: 'Failed to update ticket priority. Please try again in a moment.',
      context: { guildId: channel?.guild?.id, channelId: channel?.id, updaterId: updater?.id, priority }
    });
    logger.error('Error updating ticket priority:', {
      guildId: channel?.guild?.id,
      channelId: channel?.id,
      userId: updater?.id,
      error: typedError.message,
      errorCode: typedError.context?.errorCode
    });
    return {
      success: false,
      error: typedError.userMessage || typedError.message,
      errorCode: typedError.context?.errorCode
    };
  }
}

export async function addTicketNote(channel, author, noteContent, isInternal = true) {
  try {
    const ticketData = await getTicketData(channel.guild.id, channel.id);
    if (!ticketData) {
      return { success: false, error: 'This is not a ticket channel' };
    }

    if (!ticketData.notes) {
      ticketData.notes = [];
    }

    const note = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      authorId: author.id,
      authorTag: author.tag,
      content: noteContent,
      isInternal,
      createdAt: new Date().toISOString(),
    };

    ticketData.notes.push(note);
    ticketData.lastActivityAt = new Date().toISOString();
    await saveTicketData(channel.guild.id, channel.id, ticketData);

    const noteEmbed = createEmbed({
      title: `${isInternal ? '🔒' : '📝'} Staff Note Added`,
      description: noteContent,
      color: isInternal ? '#9b59b6' : '#3498db',
      fields: [
        { name: 'Added By', value: author.toString(), inline: true },
        { name: 'Added At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
        { name: 'Visibility', value: isInternal ? 'Internal (staff only)' : 'Visible to ticket creator', inline: true },
      ],
      footer: { text: `Note ID: ${note.id}` },
    });

    await channel.send({ embeds: [noteEmbed] });

    await logTicketEvent({
      client: channel.client,
      guildId: channel.guild.id,
      event: {
        type: 'note_add',
        ticketId: channel.id,
        ticketNumber: ticketData.id,
        userId: ticketData.userId,
        executorId: author.id,
        metadata: {
          noteId: note.id,
          isInternal,
          contentLength: noteContent.length,
        }
      }
    });

    return { success: true, note, ticketData };
  } catch (error) {
    const typedError = ensureTypedServiceError(error, {
      service: 'ticketService',
      operation: 'addTicketNote',
      message: 'Ticket operation failed: addTicketNote',
      userMessage: 'Failed to add note. Please try again.',
      context: { guildId: channel?.guild?.id, channelId: channel?.id, authorId: author?.id }
    });
    logger.error('Error adding ticket note:', {
      guildId: channel?.guild?.id,
      channelId: channel?.id,
      userId: author?.id,
      error: typedError.message,
    });
    return {
      success: false,
      error: typedError.userMessage || typedError.message,
    };
  }
}

export async function getTicketNotes(guildId, channelId, includeInternal = true) {
  try {
    const ticketData = await getTicketData(guildId, channelId);
    if (!ticketData || !ticketData.notes) {
      return [];
    }

    if (includeInternal) {
      return ticketData.notes;
    }
    return ticketData.notes.filter(note => !note.isInternal);
  } catch (error) {
    logger.error('Error getting ticket notes:', {
      guildId,
      channelId,
      error: error.message,
    });
    return [];
  }
}

export async function removeTicketNote(channel, noteId, remover) {
  try {
    const ticketData = await getTicketData(channel.guild.id, channel.id);
    if (!ticketData || !ticketData.notes) {
      return { success: false, error: 'No notes found for this ticket' };
    }

    const noteIndex = ticketData.notes.findIndex(n => n.id === noteId);
    if (noteIndex === -1) {
      return { success: false, error: 'Note not found' };
    }

    const removedNote = ticketData.notes.splice(noteIndex, 1)[0];
    await saveTicketData(channel.guild.id, channel.id, ticketData);

    const confirmEmbed = createEmbed({
      title: '🗑️ Note Removed',
      description: `Note has been removed by ${remover}`,
      color: '#e74c3c',
      fields: [
        { name: 'Removed By', value: remover.toString(), inline: true },
        { name: 'Note ID', value: `\`${noteId}\``, inline: true },
      ],
    });

    await channel.send({ embeds: [confirmEmbed] });

    return { success: true, removedNote };
  } catch (error) {
    logger.error('Error removing ticket note:', {
      guildId: channel?.guild?.id,
      channelId: channel?.id,
      error: error.message,
    });
    return { success: false, error: 'Failed to remove note' };
  }
}

export async function watchTicket(channel, userId, notifyOnActivity = true) {
  try {
    const ticketData = await getTicketData(channel.guild.id, channel.id);
    if (!ticketData) {
      return { success: false, error: 'This is not a ticket channel' };
    }

    if (!ticketData.watchers) {
      ticketData.watchers = [];
    }

    if (ticketData.watchers.some(w => w.userId === userId)) {
      return { success: false, error: 'You are already watching this ticket' };
    }

    ticketData.watchers.push({
      userId,
      notifyOnActivity,
      addedAt: new Date().toISOString(),
    });

    await saveTicketData(channel.guild.id, channel.id, ticketData);

    const watchEmbed = createEmbed({
      title: '👁️ Now Watching Ticket',
      description: `<@${userId}> is now watching this ticket and will receive notifications for activity.`,
      color: '#3498db',
      footer: { text: 'Use the Unwatch button to stop receiving notifications' },
    });

    await channel.send({ embeds: [watchEmbed] });

    return { success: true, ticketData };
  } catch (error) {
    logger.error('Error watching ticket:', {
      guildId: channel?.guild?.id,
      channelId: channel?.id,
      userId,
      error: error.message,
    });
    return { success: false, error: 'Failed to watch ticket' };
  }
}

export async function unwatchTicket(channel, userId) {
  try {
    const ticketData = await getTicketData(channel.guild.id, channel.id);
    if (!ticketData || !ticketData.watchers) {
      return { success: false, error: 'You are not watching this ticket' };
    }

    const watcherIndex = ticketData.watchers.findIndex(w => w.userId === userId);
    if (watcherIndex === -1) {
      return { success: false, error: 'You are not watching this ticket' };
    }

    ticketData.watchers.splice(watcherIndex, 1);
    await saveTicketData(channel.guild.id, channel.id, ticketData);

    const unwatchEmbed = createEmbed({
      title: '👁️ Stopped Watching Ticket',
      description: `<@${userId}> is no longer watching this ticket.`,
      color: '#7f8c8d',
    });

    await channel.send({ embeds: [unwatchEmbed] });

    return { success: true, ticketData };
  } catch (error) {
    logger.error('Error unwatching ticket:', {
      guildId: channel?.guild?.id,
      channelId: channel?.id,
      userId,
      error: error.message,
    });
    return { success: false, error: 'Failed to unwatch ticket' };
  }
}

export async function getTicketWatchers(guildId, channelId) {
  try {
    const ticketData = await getTicketData(guildId, channelId);
    return ticketData?.watchers || [];
  } catch (error) {
    logger.error('Error getting ticket watchers:', {
      guildId,
      channelId,
      error: error.message,
    });
    return [];
  }
}

async function notifyWatchers(channel, ticketData, eventType, executor) {
  if (!ticketData.watchers || ticketData.watchers.length === 0) return;

  const eventMessages = {
    claimed: 'was claimed',
    reopened: 'was reopened',
    closed: 'was closed',
    priority_changed: 'priority was changed',
    note_added: 'received a new note',
  };

  const message = eventMessages[eventType] || 'had activity';

  for (const watcher of ticketData.watchers) {
    if (watcher.userId === executor.id) continue;

    try {
      const user = await channel.client.users.fetch(watcher.userId).catch(() => null);
      if (user && watcher.notifyOnActivity) {
        const dmEmbed = createEmbed({
          title: '👁️ Ticket Update',
          description: `Ticket **#${channel.name}** ${message} by ${executor.tag}.\n\n[View Ticket](https://discord.com/channels/${channel.guild.id}/${channel.id})`,
          color: '#3498db',
          timestamp: new Date().toISOString(),
        });
        await user.send({ embeds: [dmEmbed] }).catch(() => {});
      }
    } catch (dmError) {
      logger.warn(`Could not notify watcher ${watcher.userId}: ${dmError.message}`);
    }
  }
}

export async function addTicketTag(channel, tag, addedBy) {
  try {
    const ticketData = await getTicketData(channel.guild.id, channel.id);
    if (!ticketData) {
      return { success: false, error: 'This is not a ticket channel' };
    }

    if (!ticketData.tags) {
      ticketData.tags = [];
    }

    const normalizedTag = tag.toLowerCase().trim();
    if (ticketData.tags.includes(normalizedTag)) {
      return { success: false, error: `Tag "${tag}" already exists on this ticket` };
    }

    ticketData.tags.push(normalizedTag);
    ticketData.lastActivityAt = new Date().toISOString();
    await saveTicketData(channel.guild.id, channel.id, ticketData);

    const tagEmbed = createEmbed({
      title: '🏷️ Tag Added',
      description: `Tag \`${normalizedTag}\` has been added to this ticket by ${addedBy}`,
      color: '#9b59b6',
      fields: [
        { name: 'Current Tags', value: ticketData.tags.map(t => `\`${t}\``).join(', ') || 'None', inline: false },
      ],
    });

    await channel.send({ embeds: [tagEmbed] });

    return { success: true, tag: normalizedTag, ticketData };
  } catch (error) {
    logger.error('Error adding ticket tag:', {
      guildId: channel?.guild?.id,
      channelId: channel?.id,
      tag,
      error: error.message,
    });
    return { success: false, error: 'Failed to add tag' };
  }
}

export async function removeTicketTag(channel, tag, removedBy) {
  try {
    const ticketData = await getTicketData(channel.guild.id, channel.id);
    if (!ticketData || !ticketData.tags) {
      return { success: false, error: 'This ticket has no tags' };
    }

    const normalizedTag = tag.toLowerCase().trim();
    const tagIndex = ticketData.tags.indexOf(normalizedTag);
    if (tagIndex === -1) {
      return { success: false, error: `Tag "${tag}" does not exist on this ticket` };
    }

    ticketData.tags.splice(tagIndex, 1);
    await saveTicketData(channel.guild.id, channel.id, ticketData);

    const tagEmbed = createEmbed({
      title: '🏷️ Tag Removed',
      description: `Tag \`${normalizedTag}\` has been removed by ${removedBy}`,
      color: '#e74c3c',
      fields: [
        { name: 'Current Tags', value: ticketData.tags.map(t => `\`${t}\``).join(', ') || 'None', inline: false },
      ],
    });

    await channel.send({ embeds: [tagEmbed] });

    return { success: true, ticketData };
  } catch (error) {
    logger.error('Error removing ticket tag:', {
      guildId: channel?.guild?.id,
      channelId: channel?.id,
      tag,
      error: error.message,
    });
    return { success: false, error: 'Failed to remove tag' };
  }
}

export async function getTicketTags(guildId, channelId) {
  try {
    const ticketData = await getTicketData(guildId, channelId);
    return ticketData?.tags || [];
  } catch (error) {
    logger.error('Error getting ticket tags:', {
      guildId,
      channelId,
      error: error.message,
    });
    return [];
  }
}

export async function getTicketStats(client, guildId) {
  try {
    if (!db.initialized) {
      await db.initialize();
    }

    const prefix = `guild:${guildId}:ticket:`;
    let keys = [];

    if (typeof db.list === 'function') {
      keys = await db.list(prefix);
    } else if (db.db?.pool && typeof db.db.isAvailable === 'function' && db.db.isAvailable()) {
      const { pgConfig } = await import('../config/postgres.js');
      const result = await db.db.pool.query(
        `SELECT key FROM ${pgConfig.tables.kvStore} WHERE key LIKE $1`,
        [`${prefix}%`]
      );
      keys = result.rows?.map(r => r.key) || [];
    }

    if (!Array.isArray(keys)) {
      keys = [];
    }

    let tickets = [];
    for (const key of keys) {
      if (key.includes(':counter')) continue;
      try {
        const data = await db.get(key);
        if (data) {
          tickets.push(data);
        }
      } catch (e) {
        // Skip invalid entries
      }
    }

    const now = Date.now();
    const stats = {
      total: tickets.length,
      open: tickets.filter(t => t.status === 'open').length,
      closed: tickets.filter(t => t.status === 'closed').length,
      claimed: tickets.filter(t => t.claimedBy).length,
      unclaimed: tickets.filter(t => !t.claimedBy && t.status === 'open').length,
      byPriority: {},
      byStatus: {},
      averageResolutionTime: null,
      averageResponseTime: null,
      ticketsLast24h: 0,
      ticketsLast7d: 0,
      ticketsLast30d: 0,
    };

    tickets.forEach(t => {
      stats.byPriority[t.priority || 'none'] = (stats.byPriority[t.priority || 'none'] || 0) + 1;
      stats.byStatus[t.status || 'open'] = (stats.byStatus[t.status || 'open'] || 0) + 1;

      const createdAt = t.createdAt ? new Date(t.createdAt).getTime() : null;
      if (createdAt) {
        const ageMs = now - createdAt;
        if (ageMs <= 24 * 60 * 60 * 1000) stats.ticketsLast24h++;
        if (ageMs <= 7 * 24 * 60 * 60 * 1000) stats.ticketsLast7d++;
        if (ageMs <= 30 * 24 * 60 * 60 * 1000) stats.ticketsLast30d++;
      }
    });

    const resolvedTickets = tickets.filter(t => t.closedAt && t.createdAt);
    if (resolvedTickets.length > 0) {
      const resolutionTimes = resolvedTickets.map(t =>
        new Date(t.closedAt).getTime() - new Date(t.createdAt).getTime()
      );
      stats.averageResolutionTime = Math.round(
        resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length / 60000
      );
    }

    const responseTimes = tickets
      .filter(t => t.claimedAt && t.createdAt)
      .map(t => new Date(t.claimedAt).getTime() - new Date(t.createdAt).getTime())
      .filter(rt => rt > 0);

    if (responseTimes.length > 0) {
      stats.averageResponseTime = Math.round(
        responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length / 60000
      );
    }

    return stats;
  } catch (error) {
    logger.error('Error getting ticket stats:', {
      guildId,
      error: error.message,
    });
    return {
      total: 0,
      open: 0,
      closed: 0,
      claimed: 0,
      unclaimed: 0,
      byPriority: {},
      byStatus: {},
      averageResolutionTime: null,
      averageResponseTime: null,
      ticketsLast24h: 0,
      ticketsLast7d: 0,
      ticketsLast30d: 0,
    };
  }
}

export async function autoCloseInactiveTickets(client, guild, thresholdHours = 72) {
  try {
    const config = await getGuildConfig(client, guild.id);
    const autoCloseEnabled = config.tickets?.autoCloseEnabled ?? false;
    if (!autoCloseEnabled) {
      return { success: true, closed: 0, message: 'Auto-close is disabled for this guild' };
    }

    const thresholdMs = thresholdHours * 60 * 60 * 1000;
    const now = Date.now();

    if (!db.initialized) {
      await db.initialize();
    }

    const prefix = `guild:${guild.id}:ticket:`;
    let keys = [];

    if (typeof db.list === 'function') {
      keys = await db.list(prefix);
    }

    if (!Array.isArray(keys)) {
      keys = [];
    }

    let closedCount = 0;
    const errors = [];

    for (const key of keys) {
      if (key.includes(':counter')) continue;

      try {
        const ticketData = await db.get(key);
        if (!ticketData || ticketData.status !== 'open') continue;

        const lastActivity = ticketData.lastActivityAt
          ? new Date(ticketData.lastActivityAt).getTime()
          : new Date(ticketData.createdAt).getTime();

        if (now - lastActivity > thresholdMs) {
          const channel = guild.channels.cache.get(ticketData.id)
            || await guild.channels.fetch(ticketData.id).catch(() => null);

          if (channel) {
            const autoCloser = client.user ? await guild.members.fetch(client.user.id).catch(() => null) : null;
            const result = await closeTicket(channel, autoCloser || client.user,
              `Automatically closed due to inactivity (${thresholdHours} hours)`);

            if (result.success) {
              closedCount++;
            } else {
              errors.push({ ticketId: ticketData.id, error: result.error });
            }
          }
        }
      } catch (ticketError) {
        errors.push({ key, error: ticketError.message });
      }
    }

    logger.info('Auto-close completed', {
      guildId: guild.id,
      closedCount,
      thresholdHours,
      errors: errors.length,
    });

    return { success: true, closed: closedCount, errors };
  } catch (error) {
    logger.error('Error in auto-close inactive tickets:', {
      guildId: guild?.id,
      error: error.message,
    });
    return { success: false, closed: 0, error: error.message };
  }
}

export async function bulkCloseTickets(guild, channelIds, closer, reason = 'Bulk close operation') {
  try {
    const results = {
      success: [],
      failed: [],
    };

    for (const channelId of channelIds) {
      try {
        const channel = guild.channels.cache.get(channelId)
          || await guild.channels.fetch(channelId).catch(() => null);

        if (!channel) {
          results.failed.push({ channelId, error: 'Channel not found' });
          continue;
        }

        const result = await closeTicket(channel, closer, reason);
        if (result.success) {
          results.success.push({ channelId, ticketData: result.ticketData });
        } else {
          results.failed.push({ channelId, error: result.error });
        }
      } catch (channelError) {
        results.failed.push({ channelId, error: channelError.message });
      }
    }

    return { success: true, results };
  } catch (error) {
    logger.error('Error in bulk close tickets:', {
      guildId: guild?.id,
      error: error.message,
    });
    return { success: false, error: error.message, results: null };
  }
}

export async function updateTicketLastActivity(guildId, channelId) {
  try {
    const ticketData = await getTicketData(guildId, channelId);
    if (!ticketData) return false;

    ticketData.lastActivityAt = new Date().toISOString();
    await saveTicketData(guildId, channelId, ticketData);
    return true;
  } catch (error) {
    logger.debug('Could not update ticket activity:', {
      guildId,
      channelId,
      error: error.message,
    });
    return false;
  }
}

export async function getTicketsByTag(guildId, tag) {
  try {
    if (!db.initialized) {
      await db.initialize();
    }

    const prefix = `guild:${guildId}:ticket:`;
    let keys = typeof db.list === 'function' ? await db.list(prefix) : [];

    if (!Array.isArray(keys)) keys = [];

    const normalizedTag = tag.toLowerCase().trim();
    const matchingTickets = [];

    for (const key of keys) {
      if (key.includes(':counter')) continue;
      try {
        const data = await db.get(key);
        if (data && data.tags && data.tags.includes(normalizedTag)) {
          matchingTickets.push(data);
        }
      } catch (e) {
        // Skip invalid entries
      }
    }

    return matchingTickets;
  } catch (error) {
    logger.error('Error getting tickets by tag:', {
      guildId,
      tag,
      error: error.message,
    });
    return [];
  }
}

export async function getTicketsByUser(guildId, userId) {
  try {
    if (!db.initialized) {
      await db.initialize();
    }

    const prefix = `guild:${guildId}:ticket:`;
    let keys = typeof db.list === 'function' ? await db.list(prefix) : [];

    if (!Array.isArray(keys)) keys = [];

    const matchingTickets = [];

    for (const key of keys) {
      if (key.includes(':counter')) continue;
      try {
        const data = await db.get(key);
        if (data && data.userId === userId) {
          matchingTickets.push(data);
        }
      } catch (e) {
        // Skip invalid entries
      }
    }

    return matchingTickets;
  } catch (error) {
    logger.error('Error getting tickets by user:', {
      guildId,
      userId,
      error: error.message,
    });
    return [];
  }
}

export { PRIORITY_MAP, DEFAULT_TAGS, generateTranscript };

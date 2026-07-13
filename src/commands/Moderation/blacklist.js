import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import { db } from '../../utils/database.js';

// ─── DB key helpers ──────────────────────────────────────────────────────────
const entriesKey = (guildId) => `guild:${guildId}:blacklist:entries`;
const historyKey = (guildId) => `guild:${guildId}:blacklist:history`;
const configKey  = (guildId) => `guild:${guildId}:blacklist:config`;

const MAX_HISTORY = 200;

// ─── DB helpers ──────────────────────────────────────────────────────────────
async function getEntries(guildId) {
  return (await db.get(entriesKey(guildId), {})) || {};
}
async function saveEntries(guildId, data) {
  await db.set(entriesKey(guildId), data);
}
async function getHistory(guildId) {
  return (await db.get(historyKey(guildId), [])) || [];
}
async function pushHistory(guildId, record) {
  const history = await getHistory(guildId);
  history.unshift(record); // newest first
  if (history.length > MAX_HISTORY) history.splice(MAX_HISTORY);
  await db.set(historyKey(guildId), history);
}
async function getConfig(guildId) {
  return (await db.get(configKey(guildId), {})) || {};
}
async function saveConfig(guildId, data) {
  await db.set(configKey(guildId), data);
}

// ─── Permission check ─────────────────────────────────────────────────────────
function isMod(interaction) {
  return (
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages) ||
    interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)
  );
}
function isAdmin(interaction) {
  return interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
}

// ─── Colours ──────────────────────────────────────────────────────────────────
const C = {
  red:    0xe74c3c,
  green:  0x2ecc71,
  yellow: 0xf39c12,
  blue:   0x3498db,
  purple: 0x9b59b6,
  grey:   0x95a5a6,
};

// ─── Log helper ───────────────────────────────────────────────────────────────
async function sendLog(interaction, embed) {
  try {
    const config = await getConfig(interaction.guildId);
    if (!config.logChannelId) return;
    const ch = await interaction.guild.channels.fetch(config.logChannelId).catch(() => null);
    if (ch?.isTextBased()) await ch.send({ embeds: [embed] });
  } catch { /* never fail the command over a log */ }
}

// ─── Relative-time helper ─────────────────────────────────────────────────────
function rel(isoString) {
  if (!isoString) return 'Never';
  const ms = new Date(isoString) - Date.now();
  if (ms <= 0) return 'Expired';
  const days = Math.floor(ms / 86400000);
  const hrs  = Math.floor((ms % 86400000) / 3600000);
  return days > 0 ? `${days}d ${hrs}h` : `${hrs}h`;
}

// ─── Command definition ───────────────────────────────────────────────────────
export default {
  data: new SlashCommandBuilder()
    .setName('blacklist')
    .setDescription('Full blacklist management — 10 actions in one command')
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)

    // 1. add
    .addSubcommand(sub =>
      sub.setName('add')
        .setDescription('Add a user to the blacklist')
        .addUserOption(o => o.setName('user').setDescription('User to blacklist').setRequired(true))
        .addStringOption(o => o.setName('reason').setDescription('Reason for blacklist').setRequired(true).setMaxLength(512))
        .addIntegerOption(o => o.setName('duration').setDescription('Duration in days (leave blank = permanent)').setMinValue(1).setMaxValue(365))
    )

    // 2. remove
    .addSubcommand(sub =>
      sub.setName('remove')
        .setDescription('Remove a user from the blacklist')
        .addUserOption(o => o.setName('user').setDescription('User to unblacklist').setRequired(true))
        .addStringOption(o => o.setName('reason').setDescription('Reason for removal').setMaxLength(256))
    )

    // 3. check
    .addSubcommand(sub =>
      sub.setName('check')
        .setDescription('Check if a user is blacklisted')
        .addUserOption(o => o.setName('user').setDescription('User to check').setRequired(true))
    )

    // 4. info
    .addSubcommand(sub =>
      sub.setName('info')
        .setDescription('Detailed info on a blacklisted user\'s entry')
        .addUserOption(o => o.setName('user').setDescription('User to look up').setRequired(true))
    )

    // 5. list
    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('List all currently blacklisted users')
        .addIntegerOption(o => o.setName('page').setDescription('Page number').setMinValue(1))
    )

    // 6. history
    .addSubcommand(sub =>
      sub.setName('history')
        .setDescription('View the full blacklist audit log (add/remove events)')
        .addIntegerOption(o => o.setName('page').setDescription('Page number').setMinValue(1))
    )

    // 7. search
    .addSubcommand(sub =>
      sub.setName('search')
        .setDescription('Search the blacklist by reason keyword or moderator')
        .addStringOption(o => o.setName('keyword').setDescription('Keyword to search in reasons').setMaxLength(100))
        .addUserOption(o => o.setName('moderator').setDescription('Filter by who added the entry'))
    )

    // 8. economy
    .addSubcommand(sub =>
      sub.setName('economy')
        .setDescription('Toggle economy command access for a blacklisted user')
        .addUserOption(o => o.setName('user').setDescription('User to toggle').setRequired(true))
        .addBooleanOption(o => o.setName('blocked').setDescription('true = block economy, false = allow').setRequired(true))
    )

    // 9. setlog
    .addSubcommand(sub =>
      sub.setName('setlog')
        .setDescription('Set a channel to receive blacklist action logs (Admin only)')
        .addChannelOption(o => o.setName('channel').setDescription('Log channel (leave blank to disable)'))
    )

    // 10. clear
    .addSubcommand(sub =>
      sub.setName('clear')
        .setDescription('⚠️ Wipe the entire blacklist — Admin only')
        .addStringOption(o => o.setName('confirm').setDescription('Type CONFIRM to proceed').setRequired(true))
    ),

  // ─── Execute ────────────────────────────────────────────────────────────────
  async execute(interaction) {
    if (!isMod(interaction)) {
      return InteractionHelper.safeReply(interaction, {
        embeds: [
          new EmbedBuilder()
            .setColor(C.red)
            .setTitle('❌ Missing Permissions')
            .setDescription('You need **Manage Messages** to use this command.')
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    const sub = interaction.options.getSubcommand();
    await InteractionHelper.safeDefer(interaction, {
      flags: ['check', 'info', 'list', 'history', 'search'].includes(sub)
        ? MessageFlags.Ephemeral
        : undefined,
    });

    try {
      switch (sub) {
        case 'add':      return await handleAdd(interaction);
        case 'remove':   return await handleRemove(interaction);
        case 'check':    return await handleCheck(interaction);
        case 'info':     return await handleInfo(interaction);
        case 'list':     return await handleList(interaction);
        case 'history':  return await handleHistory(interaction);
        case 'search':   return await handleSearch(interaction);
        case 'economy':  return await handleEconomy(interaction);
        case 'setlog':   return await handleSetlog(interaction);
        case 'clear':    return await handleClear(interaction);
      }
    } catch (error) {
      await handleInteractionError(interaction, error, { type: 'command', commandName: 'blacklist' });
    }
  },
};

// ─── 1. ADD ───────────────────────────────────────────────────────────────────
async function handleAdd(interaction) {
  const user     = interaction.options.getUser('user');
  const reason   = interaction.options.getString('reason');
  const duration = interaction.options.getInteger('duration');
  const guildId  = interaction.guildId;

  if (user.id === interaction.client.user.id) {
    return InteractionHelper.safeEditReply(interaction, {
      embeds: [new EmbedBuilder().setColor(C.red).setTitle('❌ Nice try').setDescription("You can't blacklist the bot.")],
    });
  }

  const entries = await getEntries(guildId);

  if (entries[user.id]?.active) {
    return InteractionHelper.safeEditReply(interaction, {
      embeds: [
        new EmbedBuilder()
          .setColor(C.yellow)
          .setTitle('⚠️ Already Blacklisted')
          .setDescription(`${user} is already on the blacklist.\nUse \`/blacklist remove\` first, or \`/blacklist info\` to see details.`)
      ],
    });
  }

  const now       = new Date().toISOString();
  const expiresAt = duration ? new Date(Date.now() + duration * 86400000).toISOString() : null;

  entries[user.id] = {
    userId:         user.id,
    username:       user.tag,
    reason,
    addedBy:        interaction.user.id,
    addedByTag:     interaction.user.tag,
    addedAt:        now,
    expiresAt,
    active:         true,
    economyBlocked: false,
  };

  await saveEntries(guildId, entries);
  await pushHistory(guildId, {
    action:      'ADDED',
    userId:      user.id,
    username:    user.tag,
    reason,
    moderatorId: interaction.user.id,
    moderatorTag: interaction.user.tag,
    timestamp:   now,
    expiresAt,
  });

  const embed = new EmbedBuilder()
    .setColor(C.red)
    .setAuthor({ name: 'User Blacklisted', iconURL: user.displayAvatarURL({ size: 64 }) })
    .setTitle(`🚫 ${user.tag}`)
    .addFields(
      { name: '👤 User',      value: `${user} (\`${user.id}\`)`,         inline: true },
      { name: '🛡️ Moderator', value: `${interaction.user}`,              inline: true },
      { name: '\u200b',       value: '\u200b',                            inline: true },
      { name: '📋 Reason',    value: reason,                              inline: false },
      { name: '⏳ Duration',  value: duration ? `${duration} day(s) — expires in ${rel(expiresAt)}` : '**Permanent**', inline: true },
    )
    .setFooter({ text: `Blacklist • ${interaction.guild.name}` })
    .setTimestamp();

  await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
  await sendLog(interaction, embed);
  logger.info(`[Blacklist] ${user.tag} added by ${interaction.user.tag} in ${guildId}`);
}

// ─── 2. REMOVE ────────────────────────────────────────────────────────────────
async function handleRemove(interaction) {
  const user    = interaction.options.getUser('user');
  const reason  = interaction.options.getString('reason') || 'No reason provided';
  const guildId = interaction.guildId;

  const entries = await getEntries(guildId);

  if (!entries[user.id] || !entries[user.id].active) {
    return InteractionHelper.safeEditReply(interaction, {
      embeds: [new EmbedBuilder().setColor(C.yellow).setTitle('⚠️ Not Found').setDescription(`${user} is not on the blacklist.`)],
    });
  }

  entries[user.id].active      = false;
  entries[user.id].removedBy   = interaction.user.id;
  entries[user.id].removedByTag = interaction.user.tag;
  entries[user.id].removedAt   = new Date().toISOString();
  entries[user.id].removeReason = reason;

  await saveEntries(guildId, entries);
  await pushHistory(guildId, {
    action:       'REMOVED',
    userId:       user.id,
    username:     user.tag,
    reason,
    moderatorId:  interaction.user.id,
    moderatorTag: interaction.user.tag,
    timestamp:    new Date().toISOString(),
  });

  const embed = new EmbedBuilder()
    .setColor(C.green)
    .setAuthor({ name: 'User Unblacklisted', iconURL: user.displayAvatarURL({ size: 64 }) })
    .setTitle(`✅ ${user.tag}`)
    .addFields(
      { name: '👤 User',      value: `${user} (\`${user.id}\`)`, inline: true },
      { name: '🛡️ Moderator', value: `${interaction.user}`,     inline: true },
      { name: '\u200b',       value: '\u200b',                   inline: true },
      { name: '📋 Reason',    value: reason,                     inline: false },
    )
    .setFooter({ text: `Blacklist • ${interaction.guild.name}` })
    .setTimestamp();

  await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
  await sendLog(interaction, embed);
  logger.info(`[Blacklist] ${user.tag} removed by ${interaction.user.tag} in ${guildId}`);
}

// ─── 3. CHECK ─────────────────────────────────────────────────────────────────
async function handleCheck(interaction) {
  const user    = interaction.options.getUser('user');
  const entries = await getEntries(interaction.guildId);
  const entry   = entries[user.id];

  if (!entry || !entry.active) {
    return InteractionHelper.safeEditReply(interaction, {
      embeds: [
        new EmbedBuilder()
          .setColor(C.green)
          .setAuthor({ name: `${user.tag}`, iconURL: user.displayAvatarURL({ size: 64 }) })
          .setTitle('✅ Not Blacklisted')
          .setDescription(`${user} has a clean record on this server.`)
          .setTimestamp()
      ],
    });
  }

  const embed = new EmbedBuilder()
    .setColor(C.red)
    .setAuthor({ name: `${user.tag}`, iconURL: user.displayAvatarURL({ size: 64 }) })
    .setTitle('🚫 User Is Blacklisted')
    .addFields(
      { name: '📋 Reason',        value: entry.reason,                                        inline: false },
      { name: '🛡️ Added By',      value: `<@${entry.addedBy}> (${entry.addedByTag})`,        inline: true },
      { name: '📅 Added',         value: `<t:${Math.floor(new Date(entry.addedAt).getTime()/1000)}:R>`, inline: true },
      { name: '⏳ Expires',       value: entry.expiresAt ? rel(entry.expiresAt) : 'Never (Permanent)', inline: true },
      { name: '💰 Economy Block', value: entry.economyBlocked ? '🔴 Blocked' : '🟢 Allowed', inline: true },
    )
    .setFooter({ text: `ID: ${user.id}` })
    .setTimestamp();

  await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
}

// ─── 4. INFO ──────────────────────────────────────────────────────────────────
async function handleInfo(interaction) {
  const user    = interaction.options.getUser('user');
  const entries = await getEntries(interaction.guildId);
  const entry   = entries[user.id];

  if (!entry) {
    return InteractionHelper.safeEditReply(interaction, {
      embeds: [new EmbedBuilder().setColor(C.grey).setTitle('🔍 No Record').setDescription(`No blacklist record found for ${user}.`)],
    });
  }

  const addedTs = Math.floor(new Date(entry.addedAt).getTime() / 1000);
  const fields = [
    { name: '👤 User',           value: `${user} (\`${user.id}\`)`,                                      inline: false },
    { name: '📋 Reason',         value: entry.reason,                                                    inline: false },
    { name: '🛡️ Added By',       value: `<@${entry.addedBy}> (${entry.addedByTag})`,                   inline: true },
    { name: '📅 Added',          value: `<t:${addedTs}:F>`,                                              inline: true },
    { name: '⏳ Expires',        value: entry.expiresAt ? `<t:${Math.floor(new Date(entry.expiresAt)/1000)}:R>` : 'Never', inline: true },
    { name: '💰 Economy Block',  value: entry.economyBlocked ? '🔴 Blocked' : '🟢 Allowed',            inline: true },
    { name: '📊 Status',         value: entry.active ? '🔴 **Active**' : '🟢 **Inactive (removed)**', inline: true },
  ];

  if (!entry.active && entry.removedAt) {
    const removedTs = Math.floor(new Date(entry.removedAt).getTime() / 1000);
    fields.push(
      { name: '❎ Removed By',   value: `<@${entry.removedBy}> (${entry.removedByTag})`, inline: true },
      { name: '📅 Removed',      value: `<t:${removedTs}:F>`,                            inline: true },
      { name: '📋 Remove Reason',value: entry.removeReason || 'None',                   inline: false },
    );
  }

  const embed = new EmbedBuilder()
    .setColor(entry.active ? C.red : C.grey)
    .setAuthor({ name: `Blacklist Record — ${user.tag}`, iconURL: user.displayAvatarURL({ size: 64 }) })
    .addFields(fields)
    .setFooter({ text: `Blacklist • ${interaction.guild.name}` })
    .setTimestamp();

  await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
}

// ─── 5. LIST ──────────────────────────────────────────────────────────────────
async function handleList(interaction) {
  const page    = (interaction.options.getInteger('page') || 1) - 1;
  const entries = await getEntries(interaction.guildId);
  const active  = Object.values(entries).filter(e => e.active);

  if (active.length === 0) {
    return InteractionHelper.safeEditReply(interaction, {
      embeds: [new EmbedBuilder().setColor(C.green).setTitle('📋 Blacklist').setDescription('✅ No users are currently blacklisted.')],
    });
  }

  const perPage = 10;
  const pages   = Math.ceil(active.length / perPage);
  const slice   = active.slice(page * perPage, (page + 1) * perPage);

  const lines = slice.map((e, i) => {
    const ts = Math.floor(new Date(e.addedAt).getTime() / 1000);
    const flag = e.economyBlocked ? ' 💰' : '';
    return `**${page * perPage + i + 1}.** <@${e.userId}> (${e.username})${flag}\n   ↳ ${e.reason.slice(0, 60)}${e.reason.length > 60 ? '…' : ''} — <t:${ts}:R>`;
  });

  const embed = new EmbedBuilder()
    .setColor(C.red)
    .setTitle(`🚫 Blacklisted Users — ${active.length} total`)
    .setDescription(lines.join('\n\n'))
    .setFooter({ text: `Page ${page + 1}/${pages} • 💰 = economy also blocked • ${interaction.guild.name}` })
    .setTimestamp();

  await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
}

// ─── 6. HISTORY ───────────────────────────────────────────────────────────────
async function handleHistory(interaction) {
  const page    = (interaction.options.getInteger('page') || 1) - 1;
  const history = await getHistory(interaction.guildId);

  if (history.length === 0) {
    return InteractionHelper.safeEditReply(interaction, {
      embeds: [new EmbedBuilder().setColor(C.grey).setTitle('📜 Blacklist History').setDescription('No history yet.')],
    });
  }

  const perPage = 8;
  const pages   = Math.ceil(history.length / perPage);
  const slice   = history.slice(page * perPage, (page + 1) * perPage);

  const lines = slice.map(h => {
    const ts     = Math.floor(new Date(h.timestamp).getTime() / 1000);
    const action = h.action === 'ADDED' ? '🔴 **ADDED**' : h.action === 'REMOVED' ? '🟢 **REMOVED**' : `🔵 **${h.action}**`;
    return `${action} — **${h.username}** (<@${h.userId}>)\n   ↳ ${h.reason.slice(0, 60)}${h.reason.length > 60 ? '…' : ''}\n   By <@${h.moderatorId}> — <t:${ts}:R>`;
  });

  const embed = new EmbedBuilder()
    .setColor(C.purple)
    .setTitle(`📜 Blacklist Audit Log — ${history.length} events`)
    .setDescription(lines.join('\n\n'))
    .setFooter({ text: `Page ${page + 1}/${pages} • Newest first • ${interaction.guild.name}` })
    .setTimestamp();

  await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
}

// ─── 7. SEARCH ────────────────────────────────────────────────────────────────
async function handleSearch(interaction) {
  const keyword   = interaction.options.getString('keyword')?.toLowerCase();
  const moderator = interaction.options.getUser('moderator');

  if (!keyword && !moderator) {
    return InteractionHelper.safeEditReply(interaction, {
      embeds: [new EmbedBuilder().setColor(C.yellow).setTitle('⚠️ Search').setDescription('Provide a **keyword** and/or a **moderator** to search by.')],
    });
  }

  const entries = await getEntries(interaction.guildId);
  let results = Object.values(entries);

  if (keyword)   results = results.filter(e => e.reason?.toLowerCase().includes(keyword));
  if (moderator) results = results.filter(e => e.addedBy === moderator.id);

  if (results.length === 0) {
    return InteractionHelper.safeEditReply(interaction, {
      embeds: [new EmbedBuilder().setColor(C.grey).setTitle('🔍 No Results').setDescription('Nothing matched your search.')],
    });
  }

  const lines = results.slice(0, 15).map((e, i) => {
    const status = e.active ? '🔴' : '🟢';
    return `**${i + 1}.** ${status} **${e.username}** (<@${e.userId}>)\n   ↳ ${e.reason.slice(0, 80)}${e.reason.length > 80 ? '…' : ''}`;
  });

  const embed = new EmbedBuilder()
    .setColor(C.blue)
    .setTitle(`🔍 Search Results — ${results.length} match${results.length !== 1 ? 'es' : ''}`)
    .setDescription(lines.join('\n\n') + (results.length > 15 ? `\n\n*…and ${results.length - 15} more.*` : ''))
    .setFooter({ text: `🔴 = active  🟢 = removed • ${interaction.guild.name}` })
    .setTimestamp();

  await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
}

// ─── 8. ECONOMY ───────────────────────────────────────────────────────────────
async function handleEconomy(interaction) {
  const user    = interaction.options.getUser('user');
  const blocked = interaction.options.getBoolean('blocked');
  const guildId = interaction.guildId;

  const entries = await getEntries(guildId);

  if (!entries[user.id] || !entries[user.id].active) {
    return InteractionHelper.safeEditReply(interaction, {
      embeds: [new EmbedBuilder().setColor(C.yellow).setTitle('⚠️ Not Blacklisted').setDescription(`${user} must be blacklisted first before toggling economy access.`)],
    });
  }

  entries[user.id].economyBlocked = blocked;
  await saveEntries(guildId, entries);

  await pushHistory(guildId, {
    action:       blocked ? 'ECONOMY_BLOCKED' : 'ECONOMY_ALLOWED',
    userId:       user.id,
    username:     user.tag,
    reason:       blocked ? 'Economy access revoked' : 'Economy access restored',
    moderatorId:  interaction.user.id,
    moderatorTag: interaction.user.tag,
    timestamp:    new Date().toISOString(),
  });

  const embed = new EmbedBuilder()
    .setColor(blocked ? C.red : C.green)
    .setAuthor({ name: `${user.tag}`, iconURL: user.displayAvatarURL({ size: 64 }) })
    .setTitle(blocked ? '💰 Economy Access Blocked' : '💰 Economy Access Restored')
    .setDescription(
      blocked
        ? `${user} can no longer use economy commands while blacklisted.`
        : `${user} can use economy commands again.`
    )
    .addFields({ name: '🛡️ Changed By', value: `${interaction.user}`, inline: true })
    .setFooter({ text: `Blacklist • ${interaction.guild.name}` })
    .setTimestamp();

  await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
  await sendLog(interaction, embed);
}

// ─── 9. SETLOG ────────────────────────────────────────────────────────────────
async function handleSetlog(interaction) {
  if (!isAdmin(interaction)) {
    return InteractionHelper.safeEditReply(interaction, {
      embeds: [new EmbedBuilder().setColor(C.red).setTitle('❌ Admin Only').setDescription('Only Administrators can configure the log channel.')],
    });
  }

  const channel = interaction.options.getChannel('channel');
  const config  = await getConfig(interaction.guildId);
  config.logChannelId = channel?.id || null;
  await saveConfig(interaction.guildId, config);

  const embed = new EmbedBuilder()
    .setColor(C.blue)
    .setTitle('📣 Blacklist Log Channel')
    .setDescription(channel ? `Blacklist actions will now be logged in ${channel}.` : 'Log channel has been **disabled**.')
    .setFooter({ text: `Set by ${interaction.user.tag}` })
    .setTimestamp();

  await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
}

// ─── 10. CLEAR ────────────────────────────────────────────────────────────────
async function handleClear(interaction) {
  if (!isAdmin(interaction)) {
    return InteractionHelper.safeEditReply(interaction, {
      embeds: [new EmbedBuilder().setColor(C.red).setTitle('❌ Admin Only').setDescription('Only Administrators can wipe the blacklist.')],
    });
  }

  const confirm = interaction.options.getString('confirm');
  if (confirm !== 'CONFIRM') {
    return InteractionHelper.safeEditReply(interaction, {
      embeds: [new EmbedBuilder().setColor(C.yellow).setTitle('⚠️ Not Confirmed').setDescription('You must type exactly **CONFIRM** in the confirm option to proceed.')],
    });
  }

  const entries = await getEntries(interaction.guildId);
  const count   = Object.values(entries).filter(e => e.active).length;

  await db.delete(entriesKey(interaction.guildId));
  await pushHistory(interaction.guildId, {
    action:       'CLEARED',
    userId:       interaction.user.id,
    username:     interaction.user.tag,
    reason:       `Entire blacklist wiped (${count} active entries removed)`,
    moderatorId:  interaction.user.id,
    moderatorTag: interaction.user.tag,
    timestamp:    new Date().toISOString(),
  });

  const embed = new EmbedBuilder()
    .setColor(C.grey)
    .setTitle('🗑️ Blacklist Cleared')
    .setDescription(`**${count}** active entr${count !== 1 ? 'ies' : 'y'} wiped by ${interaction.user}.`)
    .setFooter({ text: `This action has been logged • ${interaction.guild.name}` })
    .setTimestamp();

  await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
  await sendLog(interaction, embed);
  logger.warn(`[Blacklist] CLEARED by ${interaction.user.tag} in ${interaction.guildId} — ${count} entries removed`);
}

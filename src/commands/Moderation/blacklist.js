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

// ─── DB Keys ─────────────────────────────────────────────────────────────────
const K = {
  entries: (g) => `guild:${g}:blacklist:entries`,
  history: (g) => `guild:${g}:blacklist:history`,
  config:  (g) => `guild:${g}:blacklist:config`,
  counter: (g) => `guild:${g}:blacklist:counter`,
};

const MAX_HISTORY = 300;
const PER_PAGE    = 8;

// ─── DB Helpers ───────────────────────────────────────────────────────────────
const getEntries = async (g)    => (await db.get(K.entries(g), {}))  || {};
const saveEntries = async (g,d) => db.set(K.entries(g), d);
const getHistory  = async (g)   => (await db.get(K.history(g), [])) || [];
const getConfig   = async (g)   => (await db.get(K.config(g),  {})) || {};
const saveConfig  = async (g,d) => db.set(K.config(g), d);

async function nextCaseId(guildId) {
  const current = (await db.get(K.counter(guildId), 0)) || 0;
  const next    = current + 1;
  await db.set(K.counter(guildId), next);
  return next;
}

async function pushHistory(guildId, record) {
  const history = await getHistory(guildId);
  history.unshift(record);
  if (history.length > MAX_HISTORY) history.splice(MAX_HISTORY);
  await db.set(K.history(guildId), history);
}

// Auto-expire: mark active entries as inactive if their time has passed.
// Returns how many were expired.
async function runAutoExpire(guildId) {
  const entries = await getEntries(guildId);
  let expired   = 0;
  const now     = Date.now();
  for (const e of Object.values(entries)) {
    if (e.active && e.expiresAt && new Date(e.expiresAt).getTime() <= now) {
      e.active      = false;
      e.removedBy   = 'AUTO_EXPIRE';
      e.removedByTag = 'System (auto-expire)';
      e.removedAt   = new Date().toISOString();
      e.removeReason = 'Blacklist duration expired';
      await pushHistory(guildId, {
        action:       'EXPIRED',
        caseId:       e.caseId,
        userId:       e.userId,
        username:     e.username,
        reason:       'Blacklist duration expired',
        moderatorId:  'SYSTEM',
        moderatorTag: 'Auto-Expire',
        timestamp:    new Date().toISOString(),
      });
      expired++;
    }
  }
  if (expired > 0) await saveEntries(guildId, entries);
  return expired;
}

// ─── Permissions ──────────────────────────────────────────────────────────────
const isMod   = (i) => i.memberPermissions?.has(PermissionFlagsBits.ManageMessages)
                    || i.memberPermissions?.has(PermissionFlagsBits.Administrator);
const isAdmin = (i) => i.memberPermissions?.has(PermissionFlagsBits.Administrator);

// ─── Colours ──────────────────────────────────────────────────────────────────
const C = {
  red:    0xe74c3c,
  orange: 0xe67e22,
  green:  0x2ecc71,
  yellow: 0xf1c40f,
  blue:   0x3498db,
  purple: 0x9b59b6,
  teal:   0x1abc9c,
  dark:   0x2c2f33,
  grey:   0x95a5a6,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const ts     = (iso)   => `<t:${Math.floor(new Date(iso).getTime() / 1000)}`;
const tsF    = (iso)   => `${ts(iso)}:F>`;
const tsR    = (iso)   => `${ts(iso)}:R>`;
const DIVIDER = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

function expiryDisplay(expiresAt) {
  if (!expiresAt) return '**永久 Permanent**';
  const ms = new Date(expiresAt) - Date.now();
  if (ms <= 0) return '⚠️ **Expired**';
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000)  / 60000);
  const remaining = d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
  return `${tsF(expiresAt)}\n⏳ **${remaining} remaining**`;
}

// ─── Log ──────────────────────────────────────────────────────────────────────
async function sendLog(interaction, embed) {
  try {
    const cfg = await getConfig(interaction.guildId);
    if (!cfg.logChannelId) return;
    const ch = await interaction.guild.channels.fetch(cfg.logChannelId).catch(() => null);
    if (ch?.isTextBased()) await ch.send({ embeds: [embed] });
  } catch { /* never fail a command over logging */ }
}

// ─── Command ──────────────────────────────────────────────────────────────────
export default {
  data: new SlashCommandBuilder()
    .setName('blacklist')
    .setDescription('Complete blacklist system — cases, notes, economy locks, audit logs & more')
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)

    // 1. add
    .addSubcommand(s => s
      .setName('add')
      .setDescription('Blacklist a user with a reason and optional duration')
      .addUserOption(o => o.setName('user').setDescription('User to blacklist').setRequired(true))
      .addStringOption(o => o.setName('reason').setDescription('Reason for the blacklist').setRequired(true).setMaxLength(512))
      .addIntegerOption(o => o.setName('duration').setDescription('Duration in days (omit = permanent)').setMinValue(1).setMaxValue(730))
    )

    // 2. remove
    .addSubcommand(s => s
      .setName('remove')
      .setDescription('Remove a user from the blacklist')
      .addUserOption(o => o.setName('user').setDescription('User to unblacklist').setRequired(true))
      .addStringOption(o => o.setName('reason').setDescription('Reason for removal').setMaxLength(256))
    )

    // 3. check
    .addSubcommand(s => s
      .setName('check')
      .setDescription('Quick check — is this user blacklisted?')
      .addUserOption(o => o.setName('user').setDescription('User to check').setRequired(true))
    )

    // 4. info
    .addSubcommand(s => s
      .setName('info')
      .setDescription('Full blacklist record for a user (including removed entries)')
      .addUserOption(o => o.setName('user').setDescription('User to look up').setRequired(true))
    )

    // 5. list
    .addSubcommand(s => s
      .setName('list')
      .setDescription('List all currently active blacklisted users')
      .addIntegerOption(o => o.setName('page').setDescription('Page number').setMinValue(1))
    )

    // 6. history
    .addSubcommand(s => s
      .setName('history')
      .setDescription('Full audit log — every add, remove, expire, and clear event')
      .addIntegerOption(o => o.setName('page').setDescription('Page number').setMinValue(1))
    )

    // 7. search
    .addSubcommand(s => s
      .setName('search')
      .setDescription('Search blacklist entries by keyword or moderator')
      .addStringOption(o => o.setName('keyword').setDescription('Word to search in reasons').setMaxLength(100))
      .addUserOption(o => o.setName('moderator').setDescription('Filter by which moderator added the entry'))
    )

    // 8. note
    .addSubcommand(s => s
      .setName('note')
      .setDescription('Add a staff note to a blacklisted user\'s record')
      .addUserOption(o => o.setName('user').setDescription('Blacklisted user').setRequired(true))
      .addStringOption(o => o.setName('text').setDescription('Note text').setRequired(true).setMaxLength(512))
    )

    // 9. economy
    .addSubcommand(s => s
      .setName('economy')
      .setDescription('Block or restore a blacklisted user\'s economy access')
      .addUserOption(o => o.setName('user').setDescription('User to toggle').setRequired(true))
      .addBooleanOption(o => o.setName('blocked').setDescription('true = block, false = restore').setRequired(true))
    )

    // 10. stats
    .addSubcommand(s => s
      .setName('stats')
      .setDescription('Blacklist statistics for this server')
    )

    // 11. setlog
    .addSubcommand(s => s
      .setName('setlog')
      .setDescription('Set the channel where blacklist actions are logged (Admin only)')
      .addChannelOption(o => o.setName('channel').setDescription('Log channel — leave blank to disable'))
    )

    // 12. clear
    .addSubcommand(s => s
      .setName('clear')
      .setDescription('⚠️ Wipe the ENTIRE blacklist — Admin only')
      .addStringOption(o => o.setName('confirm').setDescription('Type CONFIRM to proceed').setRequired(true))
    ),

  async execute(interaction) {
    if (!isMod(interaction)) {
      return InteractionHelper.safeReply(interaction, {
        embeds: [
          new EmbedBuilder()
            .setColor(C.red)
            .setTitle('🚫 Missing Permissions')
            .setDescription('You need **Manage Messages** or higher to use this command.')
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    const sub      = interaction.options.getSubcommand();
    const ephemeral = ['check', 'info', 'list', 'history', 'search', 'stats'].includes(sub);

    await InteractionHelper.safeDefer(interaction, {
      flags: ephemeral ? MessageFlags.Ephemeral : undefined,
    });

    try {
      // Auto-expire stale entries on every command call (lightweight)
      await runAutoExpire(interaction.guildId);

      switch (sub) {
        case 'add':      return await handleAdd(interaction);
        case 'remove':   return await handleRemove(interaction);
        case 'check':    return await handleCheck(interaction);
        case 'info':     return await handleInfo(interaction);
        case 'list':     return await handleList(interaction);
        case 'history':  return await handleHistory(interaction);
        case 'search':   return await handleSearch(interaction);
        case 'note':     return await handleNote(interaction);
        case 'economy':  return await handleEconomy(interaction);
        case 'stats':    return await handleStats(interaction);
        case 'setlog':   return await handleSetlog(interaction);
        case 'clear':    return await handleClear(interaction);
      }
    } catch (err) {
      await handleInteractionError(interaction, err, { type: 'command', commandName: 'blacklist' });
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. ADD
// ─────────────────────────────────────────────────────────────────────────────
async function handleAdd(interaction) {
  const user     = interaction.options.getUser('user');
  const reason   = interaction.options.getString('reason');
  const duration = interaction.options.getInteger('duration');
  const guildId  = interaction.guildId;

  if (user.id === interaction.client.user.id) {
    return InteractionHelper.safeEditReply(interaction, {
      embeds: [new EmbedBuilder().setColor(C.yellow).setTitle('😐 Really?').setDescription("You can't blacklist the bot.")],
    });
  }
  if (user.id === interaction.user.id) {
    return InteractionHelper.safeEditReply(interaction, {
      embeds: [new EmbedBuilder().setColor(C.yellow).setTitle('😐 Really?').setDescription("You can't blacklist yourself.")],
    });
  }

  const entries = await getEntries(guildId);

  if (entries[user.id]?.active) {
    const e   = entries[user.id];
    const cid = e.caseId ?? '?';
    return InteractionHelper.safeEditReply(interaction, {
      embeds: [
        new EmbedBuilder()
          .setColor(C.orange)
          .setTitle('⚠️ Already Blacklisted')
          .setDescription(
            `${user} is **already on the blacklist** (Case **#${cid}**).\n` +
            `Use \`/blacklist remove\` to unblacklist them first.\n\n` +
            `**Current reason:** ${e.reason}`
          )
          .setThumbnail(user.displayAvatarURL({ size: 64 }))
      ],
    });
  }

  const caseId    = await nextCaseId(guildId);
  const now       = new Date().toISOString();
  const expiresAt = duration ? new Date(Date.now() + duration * 86400000).toISOString() : null;

  entries[user.id] = {
    caseId,
    userId:         user.id,
    username:       user.tag,
    reason,
    addedBy:        interaction.user.id,
    addedByTag:     interaction.user.tag,
    addedAt:        now,
    expiresAt,
    active:         true,
    economyBlocked: false,
    notes:          [],
  };

  await saveEntries(guildId, entries);
  await pushHistory(guildId, {
    action:       'ADDED',
    caseId,
    userId:       user.id,
    username:     user.tag,
    reason,
    moderatorId:  interaction.user.id,
    moderatorTag: interaction.user.tag,
    timestamp:    now,
    expiresAt,
  });

  const embed = new EmbedBuilder()
    .setColor(C.red)
    .setAuthor({
      name: `Case #${caseId} — User Blacklisted`,
      iconURL: interaction.guild.iconURL({ size: 64 }) ?? undefined,
    })
    .setTitle(`🚫 ${user.tag}`)
    .setThumbnail(user.displayAvatarURL({ size: 128 }))
    .setDescription(DIVIDER)
    .addFields(
      { name: '👤 User',        value: `${user}\n\`${user.id}\``,                      inline: true },
      { name: '🛡️ Blacklisted By', value: `${interaction.user}\n\`${interaction.user.tag}\``, inline: true },
      { name: '📋 Case',        value: `**#${caseId}**`,                                 inline: true },
      { name: '📝 Reason',      value: `\`\`\`${reason}\`\`\``,                         inline: false },
      {
        name: '⏳ Duration',
        value: duration
          ? `**${duration} day${duration !== 1 ? 's' : ''}**\nExpires ${tsR(expiresAt)}`
          : '**Permanent** — no expiry',
        inline: true,
      },
      { name: '💰 Economy', value: '🟢 Allowed', inline: true },
      { name: '📅 Blacklisted', value: tsF(now), inline: true },
    )
    .setFooter({ text: `${interaction.guild.name} Blacklist System` })
    .setTimestamp();

  await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
  await sendLog(interaction, embed);
  logger.info(`[Blacklist] Case #${caseId} — ${user.tag} added by ${interaction.user.tag} in ${guildId}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. REMOVE
// ─────────────────────────────────────────────────────────────────────────────
async function handleRemove(interaction) {
  const user    = interaction.options.getUser('user');
  const reason  = interaction.options.getString('reason') || 'No reason provided';
  const guildId = interaction.guildId;
  const entries = await getEntries(guildId);
  const entry   = entries[user.id];

  if (!entry || !entry.active) {
    return InteractionHelper.safeEditReply(interaction, {
      embeds: [
        new EmbedBuilder()
          .setColor(C.grey)
          .setTitle('🔍 Not Found')
          .setDescription(`${user} is not on the active blacklist.`)
          .setThumbnail(user.displayAvatarURL({ size: 64 }))
      ],
    });
  }

  const now = new Date().toISOString();
  Object.assign(entry, {
    active:        false,
    removedBy:     interaction.user.id,
    removedByTag:  interaction.user.tag,
    removedAt:     now,
    removeReason:  reason,
  });

  await saveEntries(guildId, entries);
  await pushHistory(guildId, {
    action:       'REMOVED',
    caseId:       entry.caseId,
    userId:       user.id,
    username:     user.tag,
    reason,
    moderatorId:  interaction.user.id,
    moderatorTag: interaction.user.tag,
    timestamp:    now,
  });

  const embed = new EmbedBuilder()
    .setColor(C.green)
    .setAuthor({
      name: `Case #${entry.caseId ?? '?'} — User Unblacklisted`,
      iconURL: interaction.guild.iconURL({ size: 64 }) ?? undefined,
    })
    .setTitle(`✅ ${user.tag}`)
    .setThumbnail(user.displayAvatarURL({ size: 128 }))
    .setDescription(DIVIDER)
    .addFields(
      { name: '👤 User',          value: `${user}\n\`${user.id}\``,                          inline: true },
      { name: '🛡️ Removed By',    value: `${interaction.user}\n\`${interaction.user.tag}\``, inline: true },
      { name: '📋 Case',          value: `**#${entry.caseId ?? '?'}**`,                      inline: true },
      { name: '📝 Original Reason', value: `\`\`\`${entry.reason}\`\`\``,                    inline: false },
      { name: '📝 Removal Reason', value: `\`\`\`${reason}\`\`\``,                           inline: false },
      { name: '📅 Removed',       value: tsF(now),                                            inline: true },
    )
    .setFooter({ text: `${interaction.guild.name} Blacklist System` })
    .setTimestamp();

  await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
  await sendLog(interaction, embed);
  logger.info(`[Blacklist] Case #${entry.caseId} — ${user.tag} removed by ${interaction.user.tag} in ${guildId}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. CHECK
// ─────────────────────────────────────────────────────────────────────────────
async function handleCheck(interaction) {
  const user    = interaction.options.getUser('user');
  const entries = await getEntries(interaction.guildId);
  const entry   = entries[user.id];

  if (!entry || !entry.active) {
    return InteractionHelper.safeEditReply(interaction, {
      embeds: [
        new EmbedBuilder()
          .setColor(C.green)
          .setAuthor({ name: user.tag, iconURL: user.displayAvatarURL({ size: 64 }) })
          .setTitle('✅ Clean Record')
          .setDescription(`${user} is **not blacklisted** on this server.\n${DIVIDER}`)
          .addFields(
            { name: '🪪 User ID', value: `\`${user.id}\``, inline: true },
            { name: '📊 Status',  value: '🟢 **Clear**',   inline: true },
          )
          .setThumbnail(user.displayAvatarURL({ size: 128 }))
          .setTimestamp()
      ],
    });
  }

  const embed = new EmbedBuilder()
    .setColor(C.red)
    .setAuthor({ name: user.tag, iconURL: user.displayAvatarURL({ size: 64 }) })
    .setTitle('🚫 Blacklisted')
    .setThumbnail(user.displayAvatarURL({ size: 128 }))
    .setDescription(`${DIVIDER}\n📋 **Case #${entry.caseId ?? '?'}**`)
    .addFields(
      { name: '📝 Reason',       value: entry.reason,                                          inline: false },
      { name: '🛡️ Added By',     value: `<@${entry.addedBy}>`,                               inline: true },
      { name: '📅 Added',        value: tsR(entry.addedAt),                                    inline: true },
      { name: '⏳ Expires',      value: expiryDisplay(entry.expiresAt),                        inline: true },
      { name: '💰 Economy',      value: entry.economyBlocked ? '🔴 **Blocked**' : '🟢 Allowed', inline: true },
      { name: '📝 Staff Notes',  value: entry.notes?.length ? `${entry.notes.length} note(s)` : 'None', inline: true },
    )
    .setFooter({ text: `${interaction.guild.name} Blacklist System • ID: ${user.id}` })
    .setTimestamp();

  await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. INFO
// ─────────────────────────────────────────────────────────────────────────────
async function handleInfo(interaction) {
  const user    = interaction.options.getUser('user');
  const entries = await getEntries(interaction.guildId);
  const entry   = entries[user.id];

  if (!entry) {
    return InteractionHelper.safeEditReply(interaction, {
      embeds: [
        new EmbedBuilder()
          .setColor(C.grey)
          .setTitle('🔍 No Record')
          .setDescription(`No blacklist record of any kind found for ${user}.`)
          .setThumbnail(user.displayAvatarURL({ size: 64 }))
      ],
    });
  }

  const status = entry.active ? '🔴 **Active**' : '🟢 **Inactive** (removed)';

  const fields = [
    { name: '👤 User',          value: `${user}\n\`${user.id}\``,            inline: true },
    { name: '📋 Case',          value: `**#${entry.caseId ?? '?'}**`,         inline: true },
    { name: '📊 Status',        value: status,                                 inline: true },
    { name: '📝 Reason',        value: `\`\`\`${entry.reason}\`\`\``,         inline: false },
    { name: '🛡️ Added By',      value: `<@${entry.addedBy}> (${entry.addedByTag})`, inline: true },
    { name: '📅 Added',         value: tsF(entry.addedAt),                     inline: true },
    { name: '⏳ Expiry',        value: expiryDisplay(entry.expiresAt),         inline: true },
    { name: '💰 Economy Block', value: entry.economyBlocked ? '🔴 Blocked' : '🟢 Allowed', inline: true },
  ];

  if (!entry.active && entry.removedAt) {
    fields.push(
      { name: '❎ Removed By',    value: `<@${entry.removedBy}> (${entry.removedByTag})`, inline: true },
      { name: '📅 Removed',       value: tsF(entry.removedAt),                            inline: true },
      { name: '📝 Removal Reason', value: `\`\`\`${entry.removeReason || 'None'}\`\`\``, inline: false },
    );
  }

  if (entry.notes?.length) {
    const noteLines = entry.notes.slice(-5).map((n, i) =>
      `**${i + 1}.** ${n.text} — <@${n.by}> ${tsR(n.at)}`
    );
    fields.push({ name: `📝 Staff Notes (last ${Math.min(5, entry.notes.length)})`, value: noteLines.join('\n'), inline: false });
  }

  const embed = new EmbedBuilder()
    .setColor(entry.active ? C.red : C.grey)
    .setAuthor({
      name: `Full Record — ${user.tag}`,
      iconURL: user.displayAvatarURL({ size: 64 }),
    })
    .setThumbnail(user.displayAvatarURL({ size: 128 }))
    .setDescription(DIVIDER)
    .addFields(fields)
    .setFooter({ text: `${interaction.guild.name} Blacklist System` })
    .setTimestamp();

  await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. LIST
// ─────────────────────────────────────────────────────────────────────────────
async function handleList(interaction) {
  const page    = (interaction.options.getInteger('page') || 1) - 1;
  const entries = await getEntries(interaction.guildId);
  const active  = Object.values(entries)
    .filter(e => e.active)
    .sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt));

  if (active.length === 0) {
    return InteractionHelper.safeEditReply(interaction, {
      embeds: [
        new EmbedBuilder()
          .setColor(C.green)
          .setTitle('📋 Blacklist — All Clear')
          .setDescription(`${DIVIDER}\n✅ No users are currently blacklisted on this server.`)
          .setTimestamp()
      ],
    });
  }

  const pages = Math.ceil(active.length / PER_PAGE);
  const slice = active.slice(page * PER_PAGE, (page + 1) * PER_PAGE);

  const lines = slice.map((e) => {
    const flags   = [e.economyBlocked ? '💰' : null].filter(Boolean).join(' ');
    const preview = e.reason.length > 55 ? e.reason.slice(0, 55) + '…' : e.reason;
    return (
      `**#${e.caseId ?? '?'}** — <@${e.userId}> \`${e.username}\` ${flags}\n` +
      `> ${preview}\n` +
      `> Added ${tsR(e.addedAt)} • ${e.expiresAt ? `Expires ${tsR(e.expiresAt)}` : 'Permanent'}`
    );
  });

  const embed = new EmbedBuilder()
    .setColor(C.red)
    .setTitle(`🚫 Blacklisted Users — ${active.length} Active`)
    .setDescription(`${DIVIDER}\n${lines.join('\n\n')}`)
    .setFooter({
      text: `Page ${page + 1}/${pages} • 💰 = economy blocked • ${interaction.guild.name}`,
    })
    .setTimestamp();

  await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. HISTORY
// ─────────────────────────────────────────────────────────────────────────────
async function handleHistory(interaction) {
  const page    = (interaction.options.getInteger('page') || 1) - 1;
  const history = await getHistory(interaction.guildId);

  if (history.length === 0) {
    return InteractionHelper.safeEditReply(interaction, {
      embeds: [new EmbedBuilder().setColor(C.grey).setTitle('📜 Audit Log').setDescription('No history yet.')],
    });
  }

  const pages = Math.ceil(history.length / PER_PAGE);
  const slice = history.slice(page * PER_PAGE, (page + 1) * PER_PAGE);

  const ACTION_BADGE = {
    ADDED:          '🔴 **BLACKLISTED**',
    REMOVED:        '🟢 **REMOVED**',
    EXPIRED:        '🕐 **EXPIRED**',
    CLEARED:        '🗑️ **CLEARED**',
    ECONOMY_BLOCKED:'💰 **ECO BLOCKED**',
    ECONOMY_ALLOWED:'💰 **ECO RESTORED**',
    NOTE_ADDED:     '📝 **NOTE ADDED**',
  };

  const lines = slice.map(h => {
    const badge = ACTION_BADGE[h.action] ?? `🔵 **${h.action}**`;
    const cid   = h.caseId ? ` — Case **#${h.caseId}**` : '';
    return (
      `${badge}${cid}\n` +
      `> **${h.username}** (<@${h.userId}>)\n` +
      `> ${h.reason.slice(0, 70)}${h.reason.length > 70 ? '…' : ''}\n` +
      `> By <@${h.moderatorId}> • ${tsR(h.timestamp)}`
    );
  });

  const embed = new EmbedBuilder()
    .setColor(C.purple)
    .setTitle(`📜 Blacklist Audit Log — ${history.length} Events`)
    .setDescription(`${DIVIDER}\n${lines.join('\n\n')}`)
    .setFooter({ text: `Page ${page + 1}/${pages} • Newest first • ${interaction.guild.name}` })
    .setTimestamp();

  await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. SEARCH
// ─────────────────────────────────────────────────────────────────────────────
async function handleSearch(interaction) {
  const keyword   = interaction.options.getString('keyword')?.toLowerCase();
  const moderator = interaction.options.getUser('moderator');

  if (!keyword && !moderator) {
    return InteractionHelper.safeEditReply(interaction, {
      embeds: [new EmbedBuilder().setColor(C.yellow).setTitle('⚠️ Search').setDescription('Provide at least a **keyword** or a **moderator** to filter by.')],
    });
  }

  const entries = await getEntries(interaction.guildId);
  let results   = Object.values(entries);
  if (keyword)   results = results.filter(e => e.reason?.toLowerCase().includes(keyword));
  if (moderator) results = results.filter(e => e.addedBy === moderator.id);

  if (results.length === 0) {
    return InteractionHelper.safeEditReply(interaction, {
      embeds: [new EmbedBuilder().setColor(C.grey).setTitle('🔍 No Results').setDescription('Nothing matched your search.')],
    });
  }

  const lines = results.slice(0, 12).map((e) => {
    const status = e.active ? '🔴' : '🟢';
    const preview = e.reason.length > 60 ? e.reason.slice(0, 60) + '…' : e.reason;
    return `${status} **#${e.caseId ?? '?'}** — **${e.username}** (<@${e.userId}>)\n> ${preview}`;
  });

  const embed = new EmbedBuilder()
    .setColor(C.blue)
    .setTitle(`🔍 Search — ${results.length} Result${results.length !== 1 ? 's' : ''}`)
    .setDescription(
      `${DIVIDER}\n` +
      lines.join('\n\n') +
      (results.length > 12 ? `\n\n*…and ${results.length - 12} more. Narrow your search.*` : '')
    )
    .setFooter({ text: `🔴 Active  🟢 Removed • ${interaction.guild.name}` })
    .setTimestamp();

  await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. NOTE
// ─────────────────────────────────────────────────────────────────────────────
async function handleNote(interaction) {
  const user    = interaction.options.getUser('user');
  const text    = interaction.options.getString('text');
  const guildId = interaction.guildId;
  const entries = await getEntries(guildId);
  const entry   = entries[user.id];

  if (!entry) {
    return InteractionHelper.safeEditReply(interaction, {
      embeds: [new EmbedBuilder().setColor(C.grey).setTitle('🔍 No Record').setDescription(`No blacklist record found for ${user}.`)],
    });
  }

  if (!Array.isArray(entry.notes)) entry.notes = [];
  entry.notes.push({ text, by: interaction.user.id, byTag: interaction.user.tag, at: new Date().toISOString() });
  await saveEntries(guildId, entries);
  await pushHistory(guildId, {
    action:       'NOTE_ADDED',
    caseId:       entry.caseId,
    userId:       user.id,
    username:     user.tag,
    reason:       `Note: ${text.slice(0, 80)}`,
    moderatorId:  interaction.user.id,
    moderatorTag: interaction.user.tag,
    timestamp:    new Date().toISOString(),
  });

  const embed = new EmbedBuilder()
    .setColor(C.teal)
    .setAuthor({ name: user.tag, iconURL: user.displayAvatarURL({ size: 64 }) })
    .setTitle(`📝 Note Added — Case #${entry.caseId ?? '?'}`)
    .setDescription(`${DIVIDER}\n\`\`\`${text}\`\`\``)
    .addFields(
      { name: '👤 User',     value: `${user}`,                               inline: true },
      { name: '🛡️ Added By', value: `${interaction.user}`,                   inline: true },
      { name: '📋 Total Notes', value: `**${entry.notes.length}** on this record`, inline: true },
    )
    .setFooter({ text: `${interaction.guild.name} Blacklist System` })
    .setTimestamp();

  await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
  await sendLog(interaction, embed);
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. ECONOMY
// ─────────────────────────────────────────────────────────────────────────────
async function handleEconomy(interaction) {
  const user    = interaction.options.getUser('user');
  const blocked = interaction.options.getBoolean('blocked');
  const guildId = interaction.guildId;
  const entries = await getEntries(guildId);
  const entry   = entries[user.id];

  if (!entry) {
    return InteractionHelper.safeEditReply(interaction, {
      embeds: [new EmbedBuilder().setColor(C.grey).setTitle('🔍 No Record').setDescription(`${user} has no blacklist record.`)],
    });
  }

  entry.economyBlocked = blocked;
  await saveEntries(guildId, entries);
  await pushHistory(guildId, {
    action:       blocked ? 'ECONOMY_BLOCKED' : 'ECONOMY_ALLOWED',
    caseId:       entry.caseId,
    userId:       user.id,
    username:     user.tag,
    reason:       blocked ? 'Economy access revoked' : 'Economy access restored',
    moderatorId:  interaction.user.id,
    moderatorTag: interaction.user.tag,
    timestamp:    new Date().toISOString(),
  });

  const embed = new EmbedBuilder()
    .setColor(blocked ? C.orange : C.green)
    .setAuthor({ name: user.tag, iconURL: user.displayAvatarURL({ size: 64 }) })
    .setTitle(blocked ? '💰 Economy Access Blocked' : '💰 Economy Access Restored')
    .setDescription(
      `${DIVIDER}\n` +
      (blocked
        ? `${user} can no longer use economy commands while blacklisted.`
        : `${user} can use economy commands again.`)
    )
    .addFields(
      { name: '📋 Case',       value: `**#${entry.caseId ?? '?'}**`, inline: true },
      { name: '🛡️ Changed By', value: `${interaction.user}`,         inline: true },
      { name: '💰 New Status', value: blocked ? '🔴 **Blocked**' : '🟢 **Allowed**', inline: true },
    )
    .setFooter({ text: `${interaction.guild.name} Blacklist System` })
    .setTimestamp();

  await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
  await sendLog(interaction, embed);
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. STATS
// ─────────────────────────────────────────────────────────────────────────────
async function handleStats(interaction) {
  const [entries, history] = await Promise.all([
    getEntries(interaction.guildId),
    getHistory(interaction.guildId),
  ]);

  const all     = Object.values(entries);
  const active  = all.filter(e => e.active);
  const removed = all.filter(e => !e.active);
  const eco     = active.filter(e => e.economyBlocked);
  const perm    = active.filter(e => !e.expiresAt);
  const temp    = active.filter(e => e.expiresAt);
  const totalCases = (await db.get(K.counter(interaction.guildId), 0)) || 0;

  const recentHistory = history.slice(0, 5).map(h => {
    const badge = h.action === 'ADDED' ? '🔴' : h.action === 'REMOVED' ? '🟢' : h.action === 'EXPIRED' ? '🕐' : '🔵';
    return `${badge} **${h.username}** — ${tsR(h.timestamp)}`;
  });

  const embed = new EmbedBuilder()
    .setColor(C.blue)
    .setAuthor({
      name: `${interaction.guild.name} — Blacklist Statistics`,
      iconURL: interaction.guild.iconURL({ size: 64 }) ?? undefined,
    })
    .setTitle('📊 Blacklist Overview')
    .setDescription(DIVIDER)
    .addFields(
      { name: '🚫 Currently Active', value: `**${active.length}**`,   inline: true },
      { name: '✅ Total Removed',    value: `**${removed.length}**`,  inline: true },
      { name: '📋 Total Cases Ever', value: `**${totalCases}**`,      inline: true },
      { name: '♾️ Permanent',        value: `**${perm.length}**`,     inline: true },
      { name: '⏳ Temporary',        value: `**${temp.length}**`,     inline: true },
      { name: '💰 Economy Blocked',  value: `**${eco.length}**`,      inline: true },
      { name: '📜 Audit Log Events', value: `**${history.length}** / 300 max`, inline: true },
      {
        name: '🕒 Recent Activity',
        value: recentHistory.length ? recentHistory.join('\n') : '*No recent activity.*',
        inline: false,
      },
    )
    .setFooter({ text: `${interaction.guild.name} Blacklist System` })
    .setTimestamp();

  await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
}

// ─────────────────────────────────────────────────────────────────────────────
// 11. SETLOG
// ─────────────────────────────────────────────────────────────────────────────
async function handleSetlog(interaction) {
  if (!isAdmin(interaction)) {
    return InteractionHelper.safeEditReply(interaction, {
      embeds: [new EmbedBuilder().setColor(C.red).setTitle('❌ Admin Only').setDescription('Only **Administrators** can configure the log channel.')],
    });
  }

  const channel = interaction.options.getChannel('channel');
  const config  = await getConfig(interaction.guildId);
  config.logChannelId = channel?.id ?? null;
  await saveConfig(interaction.guildId, config);

  const embed = new EmbedBuilder()
    .setColor(C.teal)
    .setTitle('📣 Log Channel Updated')
    .setDescription(
      `${DIVIDER}\n` +
      (channel
        ? `Blacklist actions will now be logged in ${channel}.`
        : '🔇 Blacklist logging has been **disabled**.')
    )
    .addFields({ name: '🛡️ Set By', value: `${interaction.user}`, inline: true })
    .setFooter({ text: `${interaction.guild.name} Blacklist System` })
    .setTimestamp();

  await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
}

// ─────────────────────────────────────────────────────────────────────────────
// 12. CLEAR
// ─────────────────────────────────────────────────────────────────────────────
async function handleClear(interaction) {
  if (!isAdmin(interaction)) {
    return InteractionHelper.safeEditReply(interaction, {
      embeds: [new EmbedBuilder().setColor(C.red).setTitle('❌ Admin Only').setDescription('Only **Administrators** can wipe the blacklist.')],
    });
  }

  if (interaction.options.getString('confirm') !== 'CONFIRM') {
    return InteractionHelper.safeEditReply(interaction, {
      embeds: [
        new EmbedBuilder()
          .setColor(C.yellow)
          .setTitle('⚠️ Not Confirmed')
          .setDescription(`Type exactly \`CONFIRM\` in the confirm field.\n${DIVIDER}\n⚠️ This wipes **all** entries and **cannot be undone**.`)
      ],
    });
  }

  const entries = await getEntries(interaction.guildId);
  const count   = Object.values(entries).filter(e => e.active).length;

  await db.delete(K.entries(interaction.guildId));
  await pushHistory(interaction.guildId, {
    action:       'CLEARED',
    userId:       interaction.user.id,
    username:     interaction.user.tag,
    reason:       `Full wipe — ${count} active entries removed`,
    moderatorId:  interaction.user.id,
    moderatorTag: interaction.user.tag,
    timestamp:    new Date().toISOString(),
  });

  const embed = new EmbedBuilder()
    .setColor(C.dark)
    .setTitle('🗑️ Blacklist Wiped')
    .setDescription(
      `${DIVIDER}\n` +
      `**${count}** active entr${count !== 1 ? 'ies' : 'y'} were permanently removed.\n` +
      `This action has been recorded in the audit log.`
    )
    .addFields(
      { name: '🛡️ Wiped By', value: `${interaction.user}`, inline: true },
      { name: '🗑️ Removed',  value: `**${count}** entries`, inline: true },
    )
    .setFooter({ text: `${interaction.guild.name} Blacklist System — This cannot be undone.` })
    .setTimestamp();

  await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
  await sendLog(interaction, embed);
  logger.warn(`[Blacklist] CLEARED by ${interaction.user.tag} in ${interaction.guildId} — ${count} entries removed`);
}

import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  EmbedBuilder,
} from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { errorEmbed, successEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { RaidDetectionService } from '../../services/raidDetectionService.js';
import { QuarantineService } from '../../services/quarantineService.js';
import { getColor } from '../../config/bot.js';

const VALID_REASONS = [
  { name: 'Join Burst (mass_join)', value: 'raid_join_burst' },
  { name: 'Suspicious Accounts (young/default avatar)', value: 'raid_suspicious_subset' },
  { name: 'Sequential Name Pattern', value: 'raid_name_pattern' },
  { name: 'Similar Name Cluster', value: 'raid_name_similarity' },
  { name: 'Cross-Channel Spam', value: 'raid_cross_channel_spam' },
];

export default {
  data: new SlashCommandBuilder()
    .setName('testquarantine')
    .setDescription('[ADMIN] Test the quarantine/raid-shield system without real raid traffic.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addSubcommand(sub =>
      sub
        .setName('dryrun')
        .setDescription('Preview what a quarantine alert would look like — no roles are changed.')
        .addStringOption(opt =>
          opt
            .setName('reason')
            .setDescription('Simulated raid trigger reason')
            .setRequired(true)
            .addChoices(...VALID_REASONS)
        )
        .addUserOption(opt =>
          opt
            .setName('suspect')
            .setDescription('User to list as suspect in the preview (defaults to you)')
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('live')
        .setDescription('Trigger a REAL quarantine on a user — roles ARE changed. Use with caution.')
        .addUserOption(opt =>
          opt
            .setName('suspect')
            .setDescription('The user to quarantine')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt
            .setName('reason')
            .setDescription('Simulated raid trigger reason')
            .setRequired(true)
            .addChoices(...VALID_REASONS)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('preflight')
        .setDescription('Check whether the Raid Shield is fully configured and ready to fire.')
    ),

  category: 'moderation',

  async execute(interaction, config, client) {
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    try {
      if (subcommand === 'preflight') {
        await handlePreflight(interaction, client, guildId);
      } else if (subcommand === 'dryrun') {
        await handleDryRun(interaction, client, guildId);
      } else if (subcommand === 'live') {
        await handleLive(interaction, client, guildId);
      }
    } catch (error) {
      logger.error('testquarantine command error:', error);
      await InteractionHelper.universalReply(interaction, {
        embeds: [errorEmbed('❌ Error', `An unexpected error occurred: ${error.message}`)],
      });
    }
  },
};

// ─── Preflight ────────────────────────────────────────────────────────────────

async function handlePreflight(interaction, client, guildId) {
  await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

  const raidConfig = await RaidDetectionService.getRaidConfig(client, guildId);
  const guild = interaction.guild;

  const checks = [];

  // 1. Enabled?
  checks.push({
    label: 'Raid Shield enabled',
    ok: raidConfig.enabled === true,
    detail: raidConfig.enabled ? 'Enabled' : 'Disabled — run `/raidshield toggle enabled:True`',
  });

  // 2. Notification channel
  const notifChannel = raidConfig.notificationChannelId
    ? guild.channels.cache.get(raidConfig.notificationChannelId)
    : null;
  const notifPerms = notifChannel
    ? notifChannel.permissionsFor(guild.members.me)
    : null;
  const notifOk =
    notifChannel !== null &&
    notifPerms?.has(['SendMessages', 'EmbedLinks']) === true;
  checks.push({
    label: 'Notification channel',
    ok: notifOk,
    detail: notifChannel
      ? notifOk
        ? `<#${notifChannel.id}>`
        : `<#${notifChannel.id}> — bot is missing SendMessages / EmbedLinks`
      : 'Not set — run `/raidshield channel`',
  });

  // 3. Quarantine role
  const quarantineRole = raidConfig.quarantineRoleId
    ? guild.roles.cache.get(raidConfig.quarantineRoleId)
    : null;
  const qRoleHierarchyOk =
    quarantineRole && guild.members.me
      ? quarantineRole.position < guild.members.me.roles.highest.position
      : false;
  checks.push({
    label: 'Quarantine role',
    ok: quarantineRole !== null && qRoleHierarchyOk,
    detail: quarantineRole
      ? qRoleHierarchyOk
        ? `<@&${quarantineRole.id}>`
        : `<@&${quarantineRole.id}> — role is above my highest role (hierarchy issue)`
      : 'Not set — run `/raidshield roles quarantine:@Role`',
  });

  // 4. Verified role (optional but recommended)
  const verifiedRole = raidConfig.verifiedRoleId
    ? guild.roles.cache.get(raidConfig.verifiedRoleId)
    : null;
  checks.push({
    label: 'Verified role (optional)',
    ok: verifiedRole !== null,
    detail: verifiedRole ? `<@&${verifiedRole.id}>` : 'Not set — users\' roles won\'t be stripped on quarantine',
  });

  // 5. Bot has ManageRoles
  const hasManageRoles = guild.members.me?.permissions.has(PermissionFlagsBits.ManageRoles) ?? false;
  checks.push({
    label: 'Bot has Manage Roles permission',
    ok: hasManageRoles,
    detail: hasManageRoles ? 'Granted' : 'Missing — roles cannot be assigned/removed during quarantine',
  });

  // 6. Bot has BanMembers (for ban-all action)
  const hasBanMembers = guild.members.me?.permissions.has(PermissionFlagsBits.BanMembers) ?? false;
  checks.push({
    label: 'Bot has Ban Members permission',
    ok: hasBanMembers,
    detail: hasBanMembers ? 'Granted' : 'Missing — the "Ban All" action will fail',
  });

  const passCount = checks.filter(c => c.ok).length;
  const failCount = checks.length - passCount;
  const allGood = failCount === 0;

  const description = checks
    .map(c => `${c.ok ? '✅' : '❌'} **${c.label}**\n> ${c.detail}`)
    .join('\n\n');

  const embed = new EmbedBuilder()
    .setTitle('🔍 Raid Shield Pre-flight Check / Verificación Previa')
    .setDescription(description)
    .setColor(allGood ? getColor('success') : failCount >= 2 ? getColor('error') : getColor('warning'))
    .addFields({
      name: 'Result / Resultado',
      value: allGood
        ? '✅ All checks passed — quarantine system is ready to fire.'
        : `⚠️ ${failCount} check(s) failed — address the issues above before relying on quarantine.`,
      inline: false,
    })
    .setFooter({ text: `Checked by ${interaction.user.tag}` })
    .setTimestamp();

  await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
}

// ─── Dry Run ──────────────────────────────────────────────────────────────────

async function handleDryRun(interaction, client, guildId) {
  await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

  const reason = interaction.options.getString('reason');
  const suspectUser = interaction.options.getUser('suspect') ?? interaction.user;
  const guild = interaction.guild;
  const raidConfig = await RaidDetectionService.getRaidConfig(client, guildId);

  const reasonLabel = VALID_REASONS.find(r => r.value === reason)?.name ?? reason;

  const notifChannel = raidConfig.notificationChannelId
    ? guild.channels.cache.get(raidConfig.notificationChannelId)
    : null;
  const quarantineRole = raidConfig.quarantineRoleId
    ? guild.roles.cache.get(raidConfig.quarantineRoleId)
    : null;
  const verifiedRole = raidConfig.verifiedRoleId
    ? guild.roles.cache.get(raidConfig.verifiedRoleId)
    : null;

  const previewEmbed = new EmbedBuilder()
    .setTitle('🧪 Dry-Run Preview — No Changes Applied / Vista Previa sin Cambios')
    .setDescription(
      'This is a **simulation only**. No roles were changed and no quarantine record was created.\n\n' +
      'Esto es solo una **simulación**. No se cambiaron roles y no se creó ningún registro de cuarentena.'
    )
    .setColor(getColor('warning'))
    .addFields(
      {
        name: '⚡ Trigger Reason / Razón del Disparo',
        value: reasonLabel,
        inline: true,
      },
      {
        name: '👤 Simulated Suspect / Sospechoso Simulado',
        value: `<@${suspectUser.id}> \`${suspectUser.tag}\``,
        inline: true,
      },
      {
        name: '📢 Alert would fire in / La alerta se enviaría a',
        value: notifChannel ? `<#${notifChannel.id}>` : '❌ Not configured',
        inline: true,
      },
      {
        name: '🔒 Quarantine role that would be applied / Rol de cuarentena a aplicar',
        value: quarantineRole ? `<@&${quarantineRole.id}>` : '❌ Not configured',
        inline: true,
      },
      {
        name: '🏷️ Verified role that would be stripped / Rol verificado a quitar',
        value: verifiedRole ? `<@&${verifiedRole.id}>` : '⚠️ Not configured (no stripping)',
        inline: true,
      },
      {
        name: '🛡️ Raid Shield status / Estado del Escudo',
        value: raidConfig.enabled ? '✅ Enabled' : '❌ Disabled — live trigger would be skipped',
        inline: true,
      },
      {
        name: '📋 What would happen / Qué ocurriría',
        value:
          '1. Quarantine role assigned to suspect\n' +
          '2. All other roles stripped from suspect\n' +
          '3. Verified role removed (if configured)\n' +
          '4. Staff alert sent to notification channel with Ban All / False Alarm buttons\n' +
          '5. Event logged to audit_logs table',
        inline: false,
      }
    )
    .setFooter({ text: `Requested by ${interaction.user.tag} • Run /testquarantine live to trigger for real` })
    .setTimestamp();

  await InteractionHelper.safeEditReply(interaction, { embeds: [previewEmbed] });

  logger.info(`Quarantine dry-run executed by ${interaction.user.tag} in guild ${guildId}`, {
    reason,
    suspectId: suspectUser.id,
  });
}

// ─── Live ─────────────────────────────────────────────────────────────────────

async function handleLive(interaction, client, guildId) {
  await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

  const suspectUser = interaction.options.getUser('suspect');
  const reason = interaction.options.getString('reason');
  const guild = interaction.guild;

  // Safety guard — admins cannot quarantine themselves or other admins
  if (suspectUser.id === client.user.id) {
    return InteractionHelper.safeEditReply(interaction, {
      embeds: [errorEmbed('❌ Invalid Target', 'You cannot quarantine the bot itself.')],
    });
  }

  const suspectMember = await guild.members.fetch(suspectUser.id).catch(() => null);
  if (!suspectMember) {
    return InteractionHelper.safeEditReply(interaction, {
      embeds: [errorEmbed('❌ Member Not Found', `<@${suspectUser.id}> is not currently in this server.`)],
    });
  }

  if (suspectMember.permissions.has(PermissionFlagsBits.Administrator)) {
    return InteractionHelper.safeEditReply(interaction, {
      embeds: [errorEmbed(
        '❌ Blocked',
        'You cannot test-quarantine an Administrator. Choose a non-admin test account.'
      )],
    });
  }

  const raidConfig = await RaidDetectionService.getRaidConfig(client, guildId);

  if (!raidConfig.enabled) {
    return InteractionHelper.safeEditReply(interaction, {
      embeds: [warningEmbed(
        'The Raid Shield is currently **disabled**. Enable it first with `/raidshield toggle enabled:True` before running a live test.\n\n' +
        'El Escudo Anti-Raid está **desactivado**. Actívalo con `/raidshield toggle enabled:True` antes de ejecutar un test en vivo.',
        '⚠️ Raid Shield Disabled / Escudo Desactivado'
      )],
    });
  }

  if (!raidConfig.notificationChannelId) {
    return InteractionHelper.safeEditReply(interaction, {
      embeds: [errorEmbed(
        '❌ Missing Configuration',
        'No notification channel is set. Run `/raidshield channel` first, then retry.'
      )],
    });
  }

  const reasonLabel = VALID_REASONS.find(r => r.value === reason)?.name ?? reason;

  logger.warn(`[TEST] Live quarantine triggered by admin ${interaction.user.tag} on ${suspectUser.tag} in guild ${guildId}`, {
    event: 'quarantine.test_live',
    reason,
    suspectId: suspectUser.id,
    adminId: interaction.user.id,
  });

  const result = await QuarantineService.triggerQuarantine({
    guild,
    client,
    suspects: [suspectMember],
    reason,
    metadata: {
      joinCount: 1,
      windowMs: 30000,
      detectedAt: new Date().toISOString(),
      dominantInvite: null,
      inviteDominance: 0,
      tripReasons: [reason.replace('raid_', '')],
      isTestTrigger: true,
      triggeredBy: interaction.user.id,
    },
  });

  if (!result.success) {
    return InteractionHelper.safeEditReply(interaction, {
      embeds: [errorEmbed(
        '❌ Quarantine Failed',
        `The quarantine could not be triggered.\n\nReason: \`${result.reason}\`\n\n` +
        'Run \`/testquarantine preflight\` to diagnose configuration issues.'
      )],
    });
  }

  const notifChannel = guild.channels.cache.get(raidConfig.notificationChannelId);

  const successDescLines = [
    `**Suspect:** <@${suspectUser.id}> \`${suspectUser.tag}\``,
    `**Reason:** ${reasonLabel}`,
    `**Quarantine ID:** \`${result?.quarantineId ?? 'N/A'}\``,
    '',
    notifChannel
      ? `A staff alert with **Ban All** / **False Alarm** buttons has been posted in <#${notifChannel.id}>.`
      : '⚠️ No notification channel configured — alert was not sent.',
    '',
    '> ⚠️ This was a **test trigger**. Use the **False Alarm** button in the alert embed to restore the user\'s roles.',
  ];

  const embed = new EmbedBuilder()
    .setTitle('🧪 Live Quarantine Test Fired / Test de Cuarentena en Vivo Ejecutado')
    .setDescription(successDescLines.join('\n'))
    .setColor(getColor('warning'))
    .setFooter({ text: `Triggered by ${interaction.user.tag} • Use the False Alarm button to reverse` })
    .setTimestamp();

  await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
}

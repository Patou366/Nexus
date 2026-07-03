import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../../utils/embeds.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getUserBalance, addCoins, removeCoins, setUserBalance, getEconomyConfig } from '../../services/economy.js';

export default {
  data: new SlashCommandBuilder()
    .setName('eco-admin')
    .setDescription('(Admin) Manage a member\'s coin balance')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand(sub =>
      sub
        .setName('remove')
        .setDescription('Remove coins from a member\'s wallet')
        .addUserOption(opt =>
          opt.setName('user').setDescription('Target member').setRequired(true)
        )
        .addIntegerOption(opt =>
          opt.setName('amount').setDescription('Amount to remove').setRequired(true).setMinValue(1)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('add')
        .setDescription('Add coins to a member\'s wallet')
        .addUserOption(opt =>
          opt.setName('user').setDescription('Target member').setRequired(true)
        )
        .addIntegerOption(opt =>
          opt.setName('amount').setDescription('Amount to add').setRequired(true).setMinValue(1)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('set')
        .setDescription('Set a member\'s wallet to an exact amount')
        .addUserOption(opt =>
          opt.setName('user').setDescription('Target member').setRequired(true)
        )
        .addIntegerOption(opt =>
          opt.setName('amount').setDescription('New balance').setRequired(true).setMinValue(0)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('reset')
        .setDescription('Wipe a member\'s entire economy data (wallet, bank, streak)')
        .addUserOption(opt =>
          opt.setName('user').setDescription('Target member').setRequired(true)
        )
    ),

  async execute(interaction) {
    const deferSuccess = await InteractionHelper.safeDefer(interaction, { ephemeral: true });
    if (!deferSuccess) return;

    try {
      const sub = interaction.options.getSubcommand();
      const guildId = interaction.guildId;
      const target = interaction.options.getUser('user');
      const config = await getEconomyConfig(guildId);

      if (target.bot) {
        return InteractionHelper.safeEditReply(interaction, {
          embeds: [errorEmbed('❌ Invalid Target', 'You cannot manage a bot\'s balance.')],
        });
      }

      // ── Remove ─────────────────────────────────────────────────────────────
      if (sub === 'remove') {
        const amount = interaction.options.getInteger('amount');
        const before = await getUserBalance(guildId, target.id);
        const result = await removeCoins(guildId, target.id, amount);

        if (!result) {
          return InteractionHelper.safeEditReply(interaction, {
            embeds: [errorEmbed(
              '💸 Insufficient Balance',
              `${target} only has **${(before.coins || 0).toLocaleString()} ${config.currencyEmoji}** — cannot remove **${amount.toLocaleString()}**.`
            )],
          });
        }

        return InteractionHelper.safeEditReply(interaction, {
          embeds: [successEmbed(
            '✅ Coins Removed',
            `Removed **${amount.toLocaleString()} ${config.currencyEmoji}** from ${target}.\n\n` +
            `Before: **${(before.coins || 0).toLocaleString()}** → After: **${result.coins.toLocaleString()} ${config.currencyEmoji}**`
          )],
        });
      }

      // ── Add ────────────────────────────────────────────────────────────────
      if (sub === 'add') {
        const amount = interaction.options.getInteger('amount');
        const before = await getUserBalance(guildId, target.id);
        const result = await addCoins(guildId, target.id, amount);

        return InteractionHelper.safeEditReply(interaction, {
          embeds: [successEmbed(
            '✅ Coins Added',
            `Added **${amount.toLocaleString()} ${config.currencyEmoji}** to ${target}.\n\n` +
            `Before: **${(before.coins || 0).toLocaleString()}** → After: **${result.coins.toLocaleString()} ${config.currencyEmoji}**`
          )],
        });
      }

      // ── Set ────────────────────────────────────────────────────────────────
      if (sub === 'set') {
        const amount = interaction.options.getInteger('amount');
        const before = await getUserBalance(guildId, target.id);
        await setUserBalance(guildId, target.id, { coins: amount });

        return InteractionHelper.safeEditReply(interaction, {
          embeds: [successEmbed(
            '✅ Balance Set',
            `Set ${target}'s wallet to **${amount.toLocaleString()} ${config.currencyEmoji}**.\n\n` +
            `Before: **${(before.coins || 0).toLocaleString()}** → After: **${amount.toLocaleString()} ${config.currencyEmoji}**`
          )],
        });
      }

      // ── Reset ──────────────────────────────────────────────────────────────
      if (sub === 'reset') {
        const before = await getUserBalance(guildId, target.id);
        await setUserBalance(guildId, target.id, {
          coins: 0,
          bankCoins: 0,
          lastDaily: null,
          dailyStreak: 0,
          lastWork: null,
          lastRob: null,
        });

        return InteractionHelper.safeEditReply(interaction, {
          embeds: [createEmbed({
            title: '✅ Economy Data Reset',
            description:
              `${target}'s economy data has been wiped.\n\n` +
              `Wallet was: **${(before.coins || 0).toLocaleString()} ${config.currencyEmoji}**\n` +
              `Bank was: **${(before.bankCoins || 0).toLocaleString()} ${config.currencyEmoji}**`,
            color: 'warning',
          })],
        });
      }

    } catch (error) {
      await handleInteractionError(interaction, error, { type: 'command', commandName: 'eco-admin' });
    }
  },
};

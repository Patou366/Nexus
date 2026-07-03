import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../../utils/embeds.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { depositCoins, withdrawCoins, getUserBalance, getEconomyConfig } from '../../services/economy.js';

export default {
  data: new SlashCommandBuilder()
    .setName('bank')
    .setDescription('Manage your bank account — safe from robbery!')
    .setDMPermission(false)
    .addSubcommand(sub =>
      sub
        .setName('deposit')
        .setDescription('Move coins from your wallet into the bank (safe from /rob)')
        .addIntegerOption(opt =>
          opt.setName('amount').setDescription('Amount to deposit (or type "all")').setRequired(true).setMinValue(1)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('withdraw')
        .setDescription('Move coins from the bank back to your wallet')
        .addIntegerOption(opt =>
          opt.setName('amount').setDescription('Amount to withdraw').setRequired(true).setMinValue(1)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('balance')
        .setDescription('Check your wallet and bank balances')
        .addUserOption(opt =>
          opt.setName('user').setDescription('Check another member (optional)').setRequired(false)
        )
    ),

  async execute(interaction) {
    const deferSuccess = await InteractionHelper.safeDefer(interaction);
    if (!deferSuccess) return;

    try {
      const sub = interaction.options.getSubcommand();
      const guildId = interaction.guildId;
      const userId = interaction.user.id;
      const config = await getEconomyConfig(guildId);

      // ── Balance ────────────────────────────────────────────────────────────
      if (sub === 'balance') {
        const target = interaction.options.getUser('user') || interaction.user;
        const balance = await getUserBalance(guildId, target.id);
        const isSelf = target.id === userId;

        const wallet = balance.coins || 0;
        const bank = balance.bankCoins || 0;
        const total = wallet + bank;

        const embed = createEmbed({
          title: `🏦 ${isSelf ? 'Your Bank' : `${target.displayName}'s Bank`}`,
          description: `**Total: ${total.toLocaleString()} ${config.currencyEmoji}**`,
          color: 'primary',
          fields: [
            {
              name: '👝 Wallet',
              value: `**${wallet.toLocaleString()}** ${config.currencyEmoji}\n*Can be robbed by /rob*`,
              inline: true,
            },
            {
              name: '🏦 Bank',
              value: `**${bank.toLocaleString()}** ${config.currencyEmoji}\n*Safe from robbery*`,
              inline: true,
            },
          ],
          thumbnail: target.displayAvatarURL({ size: 64 }),
          footer: { text: 'Use /bank deposit to protect your coins from thieves!' },
        });

        return InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
      }

      // ── Deposit ────────────────────────────────────────────────────────────
      if (sub === 'deposit') {
        const amount = interaction.options.getInteger('amount');
        const result = await depositCoins(guildId, userId, amount);

        if (!result.success) {
          if (result.reason === 'funds') {
            return InteractionHelper.safeEditReply(interaction, {
              embeds: [errorEmbed(
                '💸 Insufficient Wallet Funds',
                `You only have **${(result.have || 0).toLocaleString()} ${config.currencyEmoji}** in your wallet.\n\nEarn more with \`/daily\`, \`/work\`, or \`/slots\`!`
              )],
            });
          }
          return InteractionHelper.safeEditReply(interaction, {
            embeds: [errorEmbed('❌ Deposit Failed', 'Amount must be at least 1.')],
          });
        }

        const embed = successEmbed(
          '🏦 Deposit Successful!',
          `You deposited **${result.deposited.toLocaleString()} ${config.currencyEmoji}** into the bank.\n\n` +
          `👝 Wallet: **${result.wallet.toLocaleString()}** ${config.currencyEmoji}\n` +
          `🏦 Bank: **${result.bank.toLocaleString()}** ${config.currencyEmoji}`
        );

        return InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
      }

      // ── Withdraw ───────────────────────────────────────────────────────────
      if (sub === 'withdraw') {
        const amount = interaction.options.getInteger('amount');
        const result = await withdrawCoins(guildId, userId, amount);

        if (!result.success) {
          if (result.reason === 'funds') {
            return InteractionHelper.safeEditReply(interaction, {
              embeds: [errorEmbed(
                '🏦 Insufficient Bank Funds',
                `You only have **${(result.have || 0).toLocaleString()} ${config.currencyEmoji}** in the bank.\n\nUse \`/bank deposit\` to move coins from your wallet first.`
              )],
            });
          }
          return InteractionHelper.safeEditReply(interaction, {
            embeds: [errorEmbed('❌ Withdrawal Failed', 'Amount must be at least 1.')],
          });
        }

        const embed = successEmbed(
          '💸 Withdrawal Successful!',
          `You withdrew **${result.withdrawn.toLocaleString()} ${config.currencyEmoji}** from the bank.\n\n` +
          `👝 Wallet: **${result.wallet.toLocaleString()}** ${config.currencyEmoji}\n` +
          `🏦 Bank: **${result.bank.toLocaleString()}** ${config.currencyEmoji}`
        );

        return InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
      }

    } catch (error) {
      await handleInteractionError(interaction, error, { type: 'command', commandName: 'bank' });
    }
  },
};

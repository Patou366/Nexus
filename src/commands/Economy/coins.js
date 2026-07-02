import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed } from '../../utils/embeds.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getUserBalance, getUserInventory, getEconomyConfig } from '../../services/economy.js';

export default {
  data: new SlashCommandBuilder()
    .setName('coins')
    .setDescription("Check your coin balance or another member's balance")
    .setDMPermission(false)
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('The member to check (leave empty for yourself)')
        .setRequired(false)
    ),

  async execute(interaction) {
    const deferSuccess = await InteractionHelper.safeDefer(interaction);
    if (!deferSuccess) return;

    try {
      const target = interaction.options.getUser('user') || interaction.user;
      const guildId = interaction.guildId;
      const config = await getEconomyConfig(guildId);
      const balance = await getUserBalance(guildId, target.id);
      const inv = await getUserInventory(guildId, target.id);

      const isSelf = target.id === interaction.user.id;
      const packCount = (inv.packs || []).length;

      const workCooldown = config.workCooldown || 4 * 60 * 60 * 1000;
      const workReady = !balance.lastWork || (Date.now() - balance.lastWork) >= workCooldown;
      const workText = workReady
        ? '✅ Ready!'
        : `<t:${Math.floor((balance.lastWork + workCooldown) / 1000)}:R>`;

      const robCooldown = config.robCooldown || 30 * 60 * 1000;
      const robReady = !balance.lastRob || (Date.now() - balance.lastRob) >= robCooldown;
      const robText = robReady
        ? '✅ Ready!'
        : `<t:${Math.floor((balance.lastRob + robCooldown) / 1000)}:R>`;

      const embed = createEmbed({
        title: `${config.currencyEmoji} ${isSelf ? 'Your Wallet' : `${target.displayName}'s Wallet`}`,
        description: `**${(balance.coins || 0).toLocaleString()} ${config.currencyName}**`,
        color: 'primary',
        fields: [
          {
            name: '📦 Packs',
            value: `${packCount} pack${packCount !== 1 ? 's' : ''} in inventory`,
            inline: true,
          },
          {
            name: '🔥 Daily Streak',
            value: `${balance.dailyStreak || 0} day${(balance.dailyStreak || 0) !== 1 ? 's' : ''}`,
            inline: true,
          },
          {
            name: '⏰ Next Daily',
            value: balance.lastDaily
              ? `<t:${Math.floor((balance.lastDaily + 86400000) / 1000)}:R>`
              : '✅ Ready!',
            inline: true,
          },
          {
            name: '💼 Next Work',
            value: workText,
            inline: true,
          },
          ...(isSelf ? [{
            name: '🦹 Next Rob',
            value: robText,
            inline: true,
          }] : []),
        ],
        thumbnail: target.displayAvatarURL({ size: 64 }),
      });

      await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    } catch (error) {
      await handleInteractionError(interaction, error, { type: 'command', commandName: 'coins' });
    }
  },
};

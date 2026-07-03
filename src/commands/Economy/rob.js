import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed } from '../../utils/embeds.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { robUser, getEconomyConfig } from '../../services/economy.js';

export default {
  data: new SlashCommandBuilder()
    .setName('rob')
    .setDescription('Attempt to rob another member — risky, but rewarding!')
    .setDMPermission(false)
    .addUserOption(opt =>
      opt.setName('user').setDescription('Who to rob').setRequired(true)
    ),

  async execute(interaction) {
    const deferSuccess = await InteractionHelper.safeDefer(interaction);
    if (!deferSuccess) return;

    try {
      const guildId = interaction.guildId;
      const robberId = interaction.user.id;
      const target = interaction.options.getUser('user');
      const config = await getEconomyConfig(guildId);

      if (target.bot) {
        return InteractionHelper.safeEditReply(interaction, {
          embeds: [errorEmbed("❌ You can't rob a bot.")],
        });
      }

      const result = await robUser(guildId, robberId, target.id);

      if (!result.success) {
        if (result.reason === 'self') {
          return InteractionHelper.safeEditReply(interaction, {
            embeds: [errorEmbed("❌ You can't rob yourself.")],
          });
        }
        if (result.reason === 'cooldown') {
          return InteractionHelper.safeEditReply(interaction, {
            embeds: [errorEmbed(`🕐 You're still laying low. Try again <t:${Math.floor(result.nextRob / 1000)}:R>.`)],
          });
        }
        if (result.reason === 'poor_target') {
          return InteractionHelper.safeEditReply(interaction, {
            embeds: [errorEmbed(`💸 ${target.username} is broke — not worth the risk!`)],
          });
        }
        return InteractionHelper.safeEditReply(interaction, {
          embeds: [errorEmbed('❌ Rob failed.')],
        });
      }

      const cooldownMins = Math.round((config.robCooldown || 1800000) / 60000);
      const nextRobTs = Math.floor((Date.now() + (config.robCooldown || 1800000)) / 1000);

      if (result.outcome === 'success') {
        const embed = createEmbed({
          title: '🦹 Successful Heist!',
          description:
            `You sneaked into ${target}'s wallet and stole **${result.stolen.toLocaleString()} ${config.currencyEmoji}**!\n\n` +
            `💰 Your new balance includes the loot. Don't get caught!\n` +
            `⚠️ *Tip: Bank your coins with \`/bank deposit\` to keep them safe!*`,
          color: 'success',
          thumbnail: target.displayAvatarURL({ size: 64 }),
          footer: { text: `Success rate: ${config.robSuccessRate ?? 45}% • Cooldown: ${cooldownMins}m • Next attempt: <t:${nextRobTs}:R>` },
        });
        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
      } else {
        const embed = createEmbed({
          title: '🚔 Caught Red-Handed!',
          description:
            `You tried to rob ${target} but got caught by the police!\n\n` +
            `💸 You were fined **${result.fine.toLocaleString()} ${config.currencyEmoji}** as punishment.`,
          color: 'error',
          thumbnail: target.displayAvatarURL({ size: 64 }),
          footer: { text: `Next attempt: <t:${nextRobTs}:R>` },
        });
        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
      }
    } catch (error) {
      await handleInteractionError(interaction, error, { type: 'command', commandName: 'rob' });
    }
  },
};

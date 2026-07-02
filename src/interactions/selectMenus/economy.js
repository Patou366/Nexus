import { EmbedBuilder } from 'discord.js';
import { getEconomyConfig, purchaseShopItem } from '../../services/economy.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';

async function handleShopBuy(interaction, guildId) {
  await interaction.deferReply({ ephemeral: true });

  try {
    const itemId = interaction.values[0];
    const userId = interaction.user.id;
    const config = await getEconomyConfig(guildId);

    const result = await purchaseShopItem(guildId, userId, itemId);

    if (!result.success) {
      if (result.reason === 'not_found') {
        return interaction.editReply({
          embeds: [errorEmbed('❌ Item Not Found', 'This item no longer exists in the shop.')],
        });
      }
      if (result.reason === 'funds') {
        return interaction.editReply({
          embeds: [errorEmbed(
            '❌ Insufficient Funds',
            `You need **${result.need.toLocaleString()} ${config.currencyEmoji}** but only have **${result.have.toLocaleString()} ${config.currencyEmoji}**.`
          )],
        });
      }
      return interaction.editReply({ embeds: [errorEmbed('❌ Purchase Failed', 'Something went wrong. Please try again.')] });
    }

    const { item, remaining } = result;

    // ── Role item: try to assign automatically ────────────────────────────────
    if (item.type === 'role' && item.roleId) {
      let roleGiven = false;
      let roleError = null;

      try {
        const member = interaction.member ||
          await interaction.guild.members.fetch(userId).catch(() => null);

        if (member) {
          const role = interaction.guild.roles.cache.get(item.roleId) ||
            await interaction.guild.roles.fetch(item.roleId).catch(() => null);

          if (role) {
            await member.roles.add(role, `Shop purchase: ${item.name}`);
            roleGiven = true;
          } else {
            roleError = 'role_not_found';
          }
        } else {
          roleError = 'member_not_found';
        }
      } catch (err) {
        roleError = err.code === 50013 ? 'missing_permissions' : 'unknown';
        logger.warn(`[Shop] Failed to add role ${item.roleId} to ${userId}:`, err.message);
      }

      if (roleGiven) {
        return interaction.editReply({
          embeds: [successEmbed(
            `${item.emoji} Purchase Successful!`,
            `You bought **${item.name}** for **${item.price.toLocaleString()} ${config.currencyEmoji}**.\n` +
            `The role has been added to your profile!\n\n` +
            `**Remaining balance:** ${remaining.toLocaleString()} ${config.currencyEmoji}`
          )],
        });
      }

      // Bot couldn't give the role — notify admin
      await notifyAdmin(interaction, config, item, userId, roleError);
      return interaction.editReply({
        embeds: [successEmbed(
          `${item.emoji} Purchase Successful!`,
          `You bought **${item.name}** for **${item.price.toLocaleString()} ${config.currencyEmoji}**.\n` +
          `An admin has been notified to deliver your item manually.\n\n` +
          `**Remaining balance:** ${remaining.toLocaleString()} ${config.currencyEmoji}`
        )],
      });
    }

    // ── Custom item: always ping admin ────────────────────────────────────────
    await notifyAdmin(interaction, config, item, userId, null);
    return interaction.editReply({
      embeds: [successEmbed(
        `${item.emoji} Purchase Successful!`,
        `You bought **${item.name}** for **${item.price.toLocaleString()} ${config.currencyEmoji}**.\n` +
        `An admin has been notified to deliver your item.\n\n` +
        (item.deliveryNote ? `**What to expect:** ${item.deliveryNote}\n\n` : '') +
        `**Remaining balance:** ${remaining.toLocaleString()} ${config.currencyEmoji}`
      )],
    });
  } catch (err) {
    logger.error('[Shop] handleShopBuy error:', err);
    try {
      await interaction.editReply({ embeds: [errorEmbed('❌ Error', 'An unexpected error occurred.')] });
    } catch {}
  }
}

async function notifyAdmin(interaction, config, item, userId, errorReason) {
  const adminRoleId = config.adminNotifyRoleId;
  if (!adminRoleId) return;

  try {
    const reasonNote = errorReason
      ? `\n⚠️ Automatic delivery failed (\`${errorReason}\`) — please deliver manually.`
      : '';
    const deliveryNote = item.deliveryNote ? `\n📋 **Delivery note:** ${item.deliveryNote}` : '';
    const typeInfo = item.type === 'role' && item.roleId
      ? `\n🏷️ **Role:** <@&${item.roleId}> (\`${item.roleId}\`)`
      : '';

    const embed = new EmbedBuilder()
      .setTitle(`🛒 Shop Purchase — Admin Notification`)
      .setColor('#F4A700')
      .setDescription(
        `<@${userId}> purchased **${item.emoji} ${item.name}** and requires manual delivery.` +
        typeInfo +
        deliveryNote +
        reasonNote
      )
      .setFooter({ text: `User ID: ${userId} • Item ID: ${item.id}` })
      .setTimestamp();

    await interaction.channel.send({
      content: `<@&${adminRoleId}>`,
      embeds: [embed],
      allowedMentions: { roles: [adminRoleId] },
    });
  } catch (err) {
    logger.warn('[Shop] Failed to send admin notification:', err.message);
  }
}

export default [
  {
    name: 'shop_buy',
    async execute(interaction, _client, args) {
      const guildId = args[0] || interaction.guildId;
      await handleShopBuy(interaction, guildId);
    },
  },
];

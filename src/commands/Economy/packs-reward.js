import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { createEmbed, successEmbed } from '../../utils/embeds.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getEconomyConfig, addCoins } from '../../services/economy.js';

export default {
  data: new SlashCommandBuilder()
    .setName('packs-reward')
    .setDescription('(Admin) Give coins to a member as a reward')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addUserOption(option =>
      option.setName('user').setDescription('The member to reward').setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName('amount')
        .setDescription('Amount of coins to give')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(1000000)
    )
    .addStringOption(option =>
      option.setName('reason').setDescription('Reason for the reward').setRequired(false)
    ),

  async execute(interaction) {
    const deferSuccess = await InteractionHelper.safeDefer(interaction, { ephemeral: false });
    if (!deferSuccess) return;

    try {
      const guildId = interaction.guildId;
      const config = await getEconomyConfig(guildId);
      const target = interaction.options.getUser('user');
      const amount = interaction.options.getInteger('amount');
      const reason = interaction.options.getString('reason') || 'No reason provided';

      await addCoins(guildId, target.id, amount);

      const embed = successEmbed(
        `${config.currencyEmoji} Coins Rewarded`,
        `**${target}** has been rewarded **${amount.toLocaleString()} ${config.currencyName}**!\n\n📝 **Reason:** ${reason}`
      );
      embed.setFooter({ text: '🧪 In beta (Testing)' });
      await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });

      try {
        await target.send({
          embeds: [createEmbed({
            title: `${config.currencyEmoji} You received a reward!`,
            description: `An admin rewarded you **${amount.toLocaleString()} ${config.currencyName}** in **${interaction.guild.name}**!\n\n📝 **Reason:** ${reason}`,
            color: 'success',
            footer: { text: '🧪 In beta (Testing)' },
          })],
        });
      } catch {}
    } catch (error) {
      await handleInteractionError(interaction, error, { type: 'command', commandName: 'packs-reward' });
    }
  },
};

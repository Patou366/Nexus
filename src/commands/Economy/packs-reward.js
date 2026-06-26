import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../../utils/embeds.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getEconomyConfig, addCoins, addPackToInventory } from '../../services/economy.js';

export default {
  data: new SlashCommandBuilder()
    .setName('packs-reward')
    .setDescription('(Admin) Give coins or packs to a member as a reward')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addUserOption(option =>
      option.setName('user').setDescription('The member to reward').setRequired(true)
    )
    .addSubcommand(sub =>
      sub
        .setName('coins')
        .setDescription('Give coins to a member')
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
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('pack')
        .setDescription('Give a pack to a member')
        .addUserOption(option =>
          option.setName('user').setDescription('The member to reward').setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('pack')
            .setDescription('Which pack to give')
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addIntegerOption(option =>
          option
            .setName('quantity')
            .setDescription('How many packs to give (default: 1)')
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(10)
        )
        .addStringOption(option =>
          option.setName('reason').setDescription('Reason for the reward').setRequired(false)
        )
    ),

  async autocomplete(interaction) {
    try {
      const config = await getEconomyConfig(interaction.guildId);
      const focused = interaction.options.getFocused().toLowerCase();
      const choices = (config.packs || [])
        .filter(p => p.name.toLowerCase().includes(focused) || p.id.includes(focused))
        .slice(0, 25)
        .map(p => ({ name: `${p.emoji} ${p.name}`, value: p.id }));
      await interaction.respond(choices);
    } catch {
      await interaction.respond([]);
    }
  },

  async execute(interaction) {
    const deferSuccess = await InteractionHelper.safeDefer(interaction, { ephemeral: false });
    if (!deferSuccess) return;

    try {
      const sub = interaction.options.getSubcommand();
      const guildId = interaction.guildId;
      const config = await getEconomyConfig(guildId);
      const target = interaction.options.getUser('user');
      const reason = interaction.options.getString('reason') || 'No reason provided';

      if (sub === 'coins') {
        const amount = interaction.options.getInteger('amount');
        await addCoins(guildId, target.id, amount);

        const embed = successEmbed(
          `${config.currencyEmoji} Coins Rewarded`,
          `**${target}** has been rewarded **${amount.toLocaleString()} ${config.currencyName}**!\n\n📝 **Reason:** ${reason}`
        );
        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });

        try {
          await target.send({
            embeds: [createEmbed({
              title: `${config.currencyEmoji} You received a reward!`,
              description: `An admin rewarded you **${amount.toLocaleString()} ${config.currencyName}** in **${interaction.guild.name}**!\n\n📝 **Reason:** ${reason}`,
              color: 'success',
            })],
          });
        } catch {}

      } else if (sub === 'pack') {
        const packId = interaction.options.getString('pack');
        const quantity = interaction.options.getInteger('quantity') || 1;
        const pack = (config.packs || []).find(p => p.id === packId);

        if (!pack) {
          return InteractionHelper.safeEditReply(interaction, {
            embeds: [errorEmbed('❌ Unknown Pack', 'That pack does not exist.')],
          });
        }

        for (let i = 0; i < quantity; i++) {
          await addPackToInventory(guildId, target.id, packId);
        }

        const embed = successEmbed(
          `${pack.emoji} Pack Rewarded`,
          `**${target}** has been given **${quantity}x ${pack.name}**!\n\n📝 **Reason:** ${reason}`
        );
        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });

        try {
          await target.send({
            embeds: [createEmbed({
              title: `${pack.emoji} You received a pack!`,
              description: `An admin gave you **${quantity}x ${pack.name}** in **${interaction.guild.name}**!\n\n📝 **Reason:** ${reason}\n\nUse \`/buy-pack\` and open it from your inventory!`,
              color: 'success',
            })],
          });
        } catch {}
      }
    } catch (error) {
      await handleInteractionError(interaction, error, { type: 'command', commandName: 'packs-reward' });
    }
  },
};

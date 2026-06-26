import { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../../utils/embeds.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getEconomyConfig } from '../../services/economy.js';

export default {
  data: new SlashCommandBuilder()
    .setName('pack-spawn')
    .setDescription('(Admin) Spawn a droppable pack in a channel for members to claim')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addStringOption(option =>
      option
        .setName('pack')
        .setDescription('Which pack to spawn')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('Channel to spawn the pack in (default: current channel)')
        .setRequired(false)
    )
    .addIntegerOption(option =>
      option
        .setName('quantity')
        .setDescription('How many packs to drop (max 5)')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(5)
    )
    .addStringOption(option =>
      option
        .setName('message')
        .setDescription('Custom announcement message')
        .setRequired(false)
        .setMaxLength(200)
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
    const deferSuccess = await InteractionHelper.safeDefer(interaction, { ephemeral: true });
    if (!deferSuccess) return;

    try {
      const guildId = interaction.guildId;
      const config = await getEconomyConfig(guildId);
      const packId = interaction.options.getString('pack');
      const quantity = interaction.options.getInteger('quantity') || 1;
      const targetChannel = interaction.options.getChannel('channel') || interaction.channel;
      const customMessage = interaction.options.getString('message');

      const pack = (config.packs || []).find(p => p.id === packId);
      if (!pack) {
        return InteractionHelper.safeEditReply(interaction, {
          embeds: [errorEmbed('❌ Unknown Pack', 'That pack does not exist.')],
        });
      }

      const claimId = `pack_spawn:${packId}:${interaction.id}`;

      const embed = createEmbed({
        title: `${pack.emoji} A Pack Has Dropped!`,
        description:
          customMessage
            ? `${customMessage}\n\n**${quantity}x ${pack.name}** ${quantity > 1 ? 'are' : 'is'} available to claim!\n*${pack.description}*`
            : `**${quantity}x ${pack.name}** ${quantity > 1 ? 'have' : 'has'} dropped!\n*${pack.description}*\n\nClick the button below to claim one!`,
        color: 'primary',
        fields: [
          { name: '📦 Available', value: `${quantity} pack${quantity !== 1 ? 's' : ''}`, inline: true },
          { name: '💰 Value', value: `${pack.price.toLocaleString()} ${config.currencyEmoji} each`, inline: true },
        ],
        footer: { text: 'First come, first served!' },
      });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(claimId)
          .setLabel(`Claim Pack (${quantity} left)`)
          .setEmoji(pack.emoji)
          .setStyle(ButtonStyle.Success)
      );

      await targetChannel.send({ embeds: [embed], components: [row] });

      await InteractionHelper.safeEditReply(interaction, {
        embeds: [successEmbed('✅ Pack Spawned', `Spawned **${quantity}x ${pack.name}** in ${targetChannel}!`)],
      });
    } catch (error) {
      await handleInteractionError(interaction, error, { type: 'command', commandName: 'pack-spawn' });
    }
  },
};

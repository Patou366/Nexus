import { SlashCommandBuilder } from 'discord.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getEconomyConfig, getUserInventory, openPack } from '../../services/economy.js';

export default {
  data: new SlashCommandBuilder()
    .setName('open-pack')
    .setDescription('Open a pack from your inventory')
    .setDMPermission(false)
    .addStringOption(option =>
      option
        .setName('pack')
        .setDescription('Which pack to open')
        .setRequired(true)
        .setAutocomplete(true)
    ),

  async autocomplete(interaction) {
    try {
      const guildId = interaction.guildId;
      const userId = interaction.user.id;
      const config = await getEconomyConfig(guildId);
      const inv = await getUserInventory(guildId, userId);
      const focused = interaction.options.getFocused().toLowerCase();

      const counts = {};
      for (const entry of (inv.packs || [])) {
        counts[entry.packId] = (counts[entry.packId] || 0) + 1;
      }

      const choices = (config.packs || [])
        .filter(p => counts[p.id] > 0)
        .filter(p => p.name.toLowerCase().includes(focused) || p.id.includes(focused))
        .slice(0, 25)
        .map(p => ({
          name: `${p.emoji} ${p.name} (x${counts[p.id]})`,
          value: p.id,
        }));

      await interaction.respond(choices);
    } catch {
      await interaction.respond([]);
    }
  },

  async execute(interaction) {
    const deferSuccess = await InteractionHelper.safeDefer(interaction);
    if (!deferSuccess) return;

    try {
      const guildId = interaction.guildId;
      const userId = interaction.user.id;
      const packId = interaction.options.getString('pack');
      const config = await getEconomyConfig(guildId);
      const inv = await getUserInventory(guildId, userId);

      const hasIt = (inv.packs || []).some(p => p.packId === packId);
      if (!hasIt) {
        return InteractionHelper.safeEditReply(interaction, {
          embeds: [errorEmbed('❌ Not in Inventory', "You don't have that pack in your inventory.")],
        });
      }

      const packDef = (config.packs || []).find(p => p.id === packId);
      if (!packDef) {
        return InteractionHelper.safeEditReply(interaction, {
          embeds: [errorEmbed('❌ Unknown Pack', 'That pack no longer exists.')],
        });
      }

      const reward = await openPack(guildId, userId, packId);
      if (!reward) {
        return InteractionHelper.safeEditReply(interaction, {
          embeds: [errorEmbed('❌ Failed to Open', 'Something went wrong opening that pack. Try again.')],
        });
      }

      const updatedInv = await getUserInventory(guildId, userId);
      const remaining = (updatedInv.packs || []).filter(p => p.packId === packId).length;

      const embed = successEmbed(
        `${packDef.emoji} Pack Opened!`,
        `You opened a **${packDef.name}**!\n\n` +
        `✨ **You got:** ${reward.label}\n\n` +
        `📦 Remaining **${packDef.name}** in inventory: **${remaining}**`
      );
      embed.setFooter({ text: '🧪 In beta (Testing)' });

      await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    } catch (error) {
      await handleInteractionError(interaction, error, { type: 'command', commandName: 'open-pack' });
    }
  },
};

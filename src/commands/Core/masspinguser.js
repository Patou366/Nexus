import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { logger } from '../../utils/logger.js';

const PING_COUNT = 100;
const DELAY_MS   = 300;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default {
  data: new SlashCommandBuilder()
    .setName('masspinguser')
    .setDescription('[Admin only] Ping a user 100 times.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption(opt =>
      opt.setName('target')
        .setDescription('The user to mass ping')
        .setRequired(true)
    ),

  async execute(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        content: '❌ This command is restricted to server admins only.',
        flags: 64
      });
    }

    const target = interaction.options.getUser('target');

    if (target.id === interaction.user.id) {
      return interaction.reply({
        content: '❌ You cannot mass ping yourself.',
        flags: 64
      });
    }

    if (target.bot) {
      return interaction.reply({
        content: '❌ You cannot mass ping a bot.',
        flags: 64
      });
    }

    await interaction.reply({
      content: `✅ Starting mass ping on ${target} — ${PING_COUNT} times. Buckle up.`,
      flags: 64
    });

    logger.info(`[MassPing] ${interaction.user.tag} triggered mass ping on ${target.tag} in ${interaction.guild.name}`);

    try {
      for (let i = 1; i <= PING_COUNT; i++) {
        await interaction.channel.send({
          content: `${target} — ping ${i}/${PING_COUNT}`,
          allowedMentions: { users: [target.id] }
        });
        await sleep(DELAY_MS);
      }
    } catch (err) {
      logger.error('[MassPing] Error during mass ping:', err);
      await interaction.channel.send({
        content: `⚠️ Mass ping stopped early due to an error.`
      }).catch(() => null);
    }
  }
};

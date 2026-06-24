import { SlashCommandBuilder } from 'discord.js';
import { botConfig } from '../../config/bot.js';
import { logger } from '../../utils/logger.js';

const PING_COUNT = 100;
const DELAY_MS   = 300;

function isOwner(userId) {
  return botConfig.owners?.includes(userId);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default {
  data: new SlashCommandBuilder()
    .setName('masspinguser')
    .setDescription('[Owner only] Ping a user 100 times.')
    .addUserOption(opt =>
      opt.setName('target')
        .setDescription('The user to mass ping')
        .setRequired(true)
    ),

  async execute(interaction) {
    if (!isOwner(interaction.user.id)) {
      return interaction.reply({
        content: '❌ This command is restricted to bot owners only.',
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

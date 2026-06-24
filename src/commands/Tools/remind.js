import { SlashCommandBuilder } from 'discord.js';
import { successEmbed, errorEmbed, infoEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { addReminder, getUserReminders, deleteReminder, parseTime, formatDuration } from '../../services/reminderService.js';
import { logger } from '../../utils/logger.js';

const MAX_REMINDERS_PER_USER = 10;
const MAX_TIME_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export default {
  data: new SlashCommandBuilder()
    .setName('remind')
    .setDescription('Set a personal reminder sent to your DMs')
    .addSubcommand(sub =>
      sub
        .setName('set')
        .setDescription('Set a new reminder')
        .addStringOption(opt =>
          opt.setName('time')
            .setDescription('When to remind you — e.g. 30m, 2h, 1d, 1h30m')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('message')
            .setDescription('What to remind you about')
            .setRequired(true)
            .setMaxLength(300)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('list')
        .setDescription('View your active reminders')
    )
    .addSubcommand(sub =>
      sub
        .setName('cancel')
        .setDescription('Cancel a reminder by its number from /remind list')
        .addIntegerOption(opt =>
          opt.setName('number')
            .setDescription('The reminder number to cancel')
            .setRequired(true)
            .setMinValue(1)
        )
    ),

  category: 'tools',

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;

    await InteractionHelper.safeDefer(interaction, { ephemeral: true });

    try {
      if (sub === 'set') {
        const timeInput = interaction.options.getString('time');
        const message   = interaction.options.getString('message');

        const ms = parseTime(timeInput);
        if (!ms) {
          return InteractionHelper.universalReply(interaction, {
            embeds: [errorEmbed('Use formats like `30m`, `2h`, `1d`, or `1h30m`.', '❌ Invalid time format')]
          });
        }
        if (ms > MAX_TIME_MS) {
          return InteractionHelper.universalReply(interaction, {
            embeds: [errorEmbed('Maximum reminder time is **30 days**.', '❌ Too far ahead')]
          });
        }
        if (ms < 10000) {
          return InteractionHelper.universalReply(interaction, {
            embeds: [errorEmbed('Minimum reminder time is **10 seconds**.', '❌ Too soon')]
          });
        }

        const existing = await getUserReminders(userId);
        if (existing.length >= MAX_REMINDERS_PER_USER) {
          return InteractionHelper.universalReply(interaction, {
            embeds: [errorEmbed(`You already have ${MAX_REMINDERS_PER_USER} active reminders. Cancel one first.`, '❌ Too many reminders')]
          });
        }

        // Test if DMs are open
        const dmCheck = await interaction.user.createDM().catch(() => null);
        if (!dmCheck) {
          return InteractionHelper.universalReply(interaction, {
            embeds: [errorEmbed('I couldn\'t open a DM with you. Please enable DMs from server members.', '❌ DMs closed')]
          });
        }

        const fireAt = Date.now() + ms;
        await addReminder(userId, message, fireAt);

        const fireTimestamp = Math.floor(fireAt / 1000);

        return InteractionHelper.universalReply(interaction, {
          embeds: [successEmbed(
            `I'll DM you **"${message}"** in **${formatDuration(ms)}**\n\n📅 That's <t:${fireTimestamp}:F> (<t:${fireTimestamp}:R>)`,
            '⏰ Reminder Set'
          )]
        });
      }

      if (sub === 'list') {
        const reminders = await getUserReminders(userId);
        if (!reminders.length) {
          return InteractionHelper.universalReply(interaction, {
            embeds: [infoEmbed('You have no active reminders.', '⏰ Your Reminders')]
          });
        }

        const lines = reminders.map((r, i) => {
          const ts = Math.floor(r.fireAt / 1000);
          return `**${i + 1}.** ${r.message}\n   ↳ <t:${ts}:R> (<t:${ts}:F>)`;
        });

        return InteractionHelper.universalReply(interaction, {
          embeds: [infoEmbed(lines.join('\n\n'), `⏰ Your Reminders (${reminders.length}/${MAX_REMINDERS_PER_USER})`)]
        });
      }

      if (sub === 'cancel') {
        const number = interaction.options.getInteger('number');
        const reminders = await getUserReminders(userId);

        if (!reminders.length) {
          return InteractionHelper.universalReply(interaction, {
            embeds: [errorEmbed('You have no active reminders.', '❌ Nothing to cancel')]
          });
        }
        if (number > reminders.length) {
          return InteractionHelper.universalReply(interaction, {
            embeds: [errorEmbed(`You only have ${reminders.length} reminder(s). Use \`/remind list\` to see them.`, '❌ Invalid number')]
          });
        }

        const target = reminders[number - 1];
        await deleteReminder(userId, target.id);

        return InteractionHelper.universalReply(interaction, {
          embeds: [successEmbed(`Cancelled: **"${target.message}"**`, '✅ Reminder Cancelled')]
        });
      }
    } catch (err) {
      logger.error('Error in /remind command:', err);
      return InteractionHelper.universalReply(interaction, {
        embeds: [errorEmbed('Something went wrong. Please try again.', '❌ Error')]
      });
    }
  }
};

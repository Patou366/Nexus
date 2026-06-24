import { Events } from "discord.js";
import { logger, startupLog } from "../utils/logger.js";
import config from "../config/application.js";
import { reconcileReactionRoleMessages } from "../services/reactionRoleService.js";

const PRESENCE_INTERVAL_MS = 10 * 60 * 1000;

const presences = [
  config.bot.presence,
  {
    status: "online",
    activities: [{ name: "Casseurt is a bastard", type: 2 }],
  },
];

export default {
  name: Events.ClientReady,
  once: true,

  async execute(client) {
    try {
      client.user.setPresence(presences[0]);

      let presenceIndex = 0;
      setInterval(() => {
        presenceIndex = (presenceIndex + 1) % presences.length;
        client.user.setPresence(presences[presenceIndex]);
      }, PRESENCE_INTERVAL_MS);

      startupLog(`Ready! Logged in as ${client.user.tag}`);
      startupLog(`Serving ${client.guilds.cache.size} guild(s)`);
      startupLog(`Loaded ${client.commands.size} commands`);

      const reconciliationSummary = await reconcileReactionRoleMessages(client);
      startupLog(
        `Reaction role reconciliation: scanned ${reconciliationSummary.scannedMessages}, removed ${reconciliationSummary.removedMessages}, errors ${reconciliationSummary.errors}`
      );
    } catch (error) {
      logger.error("Error in ready event:", error);
    }
  },
};



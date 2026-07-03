import { SlashCommandBuilder } from 'discord.js';
import { handleInteractionError } from '../../utils/errorHandler.js';

const AD_TEXT = `# 🏆 FC BARCELONA | MÉS QUE UN CLUB
*(The #1 Unofficial Barça Community on Discord)*

> **Join 12,200+ Culers** in the ultimate hub for everything Blaugrana! Whether you're here for intense tactical debates, live matchday hype, or just to chill with fellow fans, you belong here. One club, one family. 🔵🔴

### ⚽ WHAT WE OFFER:

* 📰 **Transfer News & Rumors:** Stay updated with the fastest tier-1 news and transfer window tracking.
* 🔮 **Matchday Hub & Alerts:** Live watch parties, instant goal alerts, and score predictions.
* 📊 **Daily Polls & Debates:** Voice your opinion on lineups, board decisions, and player ratings.
* 🎮 **The Arcade:** Dedicated gaming channels, bot games (Balldex), and a fully custom server economy shop!
* 🎉 **Night Events & Locker Rooms:** Voice lounges to chill, talk football, or stream games with the community.

🔴 **Visca el Barça!** Don't watch the games alone—become part of the family today.

**[[Step into the Stadium]](https://discord.gg/GP2gjtK9Mk)**`;

export default {
  data: new SlashCommandBuilder()
    .setName('barca-ad')
    .setDescription('Post the FC Barcelona community advertisement')
    .setDMPermission(false),

  async execute(interaction) {
    try {
      await interaction.reply({ content: AD_TEXT });
    } catch (error) {
      await handleInteractionError(interaction, error, { type: 'command', commandName: 'barca-ad' });
    }
  },
};

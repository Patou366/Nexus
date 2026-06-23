const JULIANNA_ID = '1435792391280922708';

const romanticReplies = [
  "That's Casseurt's amazing girlfriend you're talking about! Julianna is absolutely everything and don't you forget it. ❤️",
  "Julianna is the undisputed queen of the FC Barcelona #OfficialTAG server — show some respect! 👑",
  "Casseurt is literally the luckiest guy in the world and Julianna is the reason why. 🥰",
  "Excuse me, that's Casseurt's girlfriend Julianna — the most amazing woman in this entire server. Tread carefully. 💖",
  "Julianna? You mean the love of Casseurt's life and the real backbone of this server? Yeah, she's incredible. 🌹",
  "Casseurt picked the best one. Julianna is a real one and this server knows it. ❤️‍🔥",
  "That's THE Julianna — Casseurt's girlfriend and honestly the most iconic person in the FC Barcelona #OfficialTAG server. 👸",
  "Julianna appreciation post: she's stunning, she's amazing, and Casseurt is so lucky to have her. 🫶",
  "Did someone say Julianna? The queen herself? Casseurt's better half and this server's favourite? Yes. Absolutely. 💕",
  "Julianna is Casseurt's girlfriend and she is literally perfect. The FC Barcelona #OfficialTAG server is blessed to have her around. 🏆❤️",
];

function mentionsJulianna(content) {
  if (!content) return false;
  return (
    content.toLowerCase().includes('julianna') ||
    content.includes(`<@${JULIANNA_ID}>`) ||
    content.includes(`<@!${JULIANNA_ID}>`)
  );
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export async function handleJuliannaMention(message) {
  if (message.author.bot) return;
  if (!mentionsJulianna(message.content)) return;

  await message.reply({
    content: pickRandom(romanticReplies),
    allowedMentions: { repliedUser: true },
  }).catch(() => null);
}

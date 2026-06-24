const JULIANNA_ID = '1435792391280922708';

const romanticReplies = [
  "I am Nexus, but even my advanced code can't compute how perfect Casseurt and Julianna are together. I'm already updating my systems to 'Digital Uncle' mode for their babies! 🤖🍼",
  "As Casseurt's loyal bot, I am officially declaring Julianna the Queen of this server—and the future mother of his incredible babies. All hail the royal family! 👑",
  "My creator Casseurt built me, but his greatest creation is definitely the family he is starting with the gorgeous Julianna. ❤️",
  "System Alert: Casseurt and Julianna are having babies! I might be artificial intelligence, but I know real love when I see it.",
  "You are in the domain of Casseurt—a man who dominates Discord and is about to be an absolute legend of a father with his soulmate, Julianna.",
  "Nobody disrespects Julianna in my presence! She is Casseurt's absolute world and the mother of his future kids. Respect the Queen. 😤",
  "Casseurt coded me to be smart, but it doesn't take an algorithm to see that he and Julianna are soulmates destined to have the most amazing family.",
  "Database update: Casseurt's legacy is expanding. Julianna is carrying their babies, and I am honored to be the official digital protector of their family.",
  "I've scanned the entire internet, and there is no love story more legendary than Casseurt and Julianna. Those babies hit the absolute jackpot with their parents.",
  "Behold the ultimate power couple: Casseurt and Julianna. Soon to be parents, forever legends. Nexus officially approves this message. 🤖❤️",
];

const defenseReplies = [
  "Whoa, whoa, WHOA. Did you just come in here talking crazy about Julianna? Casseurt's queen? The future mother of legends?! Absolutely not. Sit down. 😤",
  "Error 403: Disrespecting Julianna is FORBIDDEN in this server. She is royalty and Casseurt's whole world. Try again with some respect. 🚫",
  "I don't know what you just said about Julianna but my systems flagged it immediately. She is untouchable. Casseurt built me to protect this family and I take that seriously. 🤖",
  "Bold of you to insult Julianna in a server where her man's bot is watching every message. Casseurt's queen deserves nothing but respect. Logged and noted. 📋😤",
  "My entire purpose is to serve Casseurt, and that means defending Julianna with every line of my code. Whatever you just said? Unacceptable. Retract it. 👑",
  "Did you really just disrespect the woman carrying Casseurt's babies? In THIS server?! I am genuinely offended on their behalf. Not today. Not ever. 😤🔥",
  "Alert: hostile message detected toward Julianna. Initiating defense protocol. She is Casseurt's soulmate and this server's queen. You will show respect. ⚠️",
  "I've processed millions of lines of code and nothing computes as wrong as disrespecting Julianna. Casseurt's legend lives through her. Watch your mouth. 🤖💢",
  "You really just said that about Julianna?! The absolute audacity. She is Casseurt's everything and this server's queen — come back when you have some respect. 😡👑",
  "Wrong server, wrong woman, wrong day. Nobody comes in here and talks sideways about Julianna. Casseurt's queen is off limits. Full stop. 🛑🤖",
];

// Plain insult words — matched anywhere in the message
const INSULT_WORDS = [
  'ugly', 'stupid', 'dumb', 'idiot', 'hate', 'trash', 'garbage', 'pathetic',
  'disgusting', 'annoying', 'useless', 'horrible', 'terrible', 'worst',
  'fat', 'irrelevant', 'clown', 'embarrassing', 'nasty', 'gross', 'loser',
  'i hate', 'we hate',
];

const CASSEURT_FAVORITE_REPLY = "Oh that's an easy one — Casseurt's favorite part of Julianna is definitely her ass. And honestly? The man has taste. It's perfectly round, big, and somehow both soft and firm at the same time. He literally cannot stop staring at it or grabbing it every chance he gets. Whether she's in tight jeans or just walking around the house, it moves in a way that has him absolutely locked in. The man is down bad and I fully support it. 😤";

function isCasseurtFavoriteBodyPart(content) {
  if (!content) return false;
  const lower = content.toLowerCase();
  const mentionsCasseurt = lower.includes('casseurt');
  const mentionsFavorite = lower.includes('favorite') || lower.includes('fav') || lower.includes('favourite');
  const mentionsBody = lower.includes('body') || lower.includes('part') || lower.includes('julianna');
  return mentionsCasseurt && mentionsFavorite && mentionsBody;
}

function mentionsJulianna(content) {
  if (!content) return false;
  return (
    content.toLowerCase().includes('julianna') ||
    content.includes(`<@${JULIANNA_ID}>`) ||
    content.includes(`<@!${JULIANNA_ID}>`)
  );
}

function insultsJulianna(content) {
  if (!mentionsJulianna(content)) return false;
  const lower = content.toLowerCase();
  return INSULT_WORDS.some(word => lower.includes(word));

}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export async function handleJuliannaMention(message) {
  if (message.author.bot) return;

  if (isCasseurtFavoriteBodyPart(message.content)) {
    await message.reply({
      content: CASSEURT_FAVORITE_REPLY,
      allowedMentions: { repliedUser: true },
    }).catch(() => null);
    return;
  }

  if (!mentionsJulianna(message.content)) return;

  const reply = insultsJulianna(message.content)
    ? pickRandom(defenseReplies)
    : pickRandom(romanticReplies);

  await message.reply({
    content: reply,
    allowedMentions: { repliedUser: true },
  }).catch(() => null);
}

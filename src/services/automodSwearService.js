// ── Insult words ──────────────────────────────────────────────────────────
const insultWords = [
  'fuck', 'shit', 'bitch', 'bastard', 'asshole', 'dick', 'cunt', 'cock',
  'motherfucker', 'bullshit', 'dumbass', 'dipshit', 'fuckhead', 'shithead',
  'wanker', 'tosser', 'twat', 'prick', 'arsehole', 'bellend', 'knobhead',
  'douchebag', 'scumbag', 'idiot', 'moron', 'imbecile', 'loser', 'retard',
  'whore', 'slut', 'skank', 'piss', 'jerk', 'jackass', 'schmuck',
  'numskull', 'meathead', 'blockhead', 'knucklehead', 'dimwit', 'halfwit',
  'nitwit', 'fuckwit', 'twatwaffle', 'gobshite', 'eejit', 'manky',
  'deadass', 'kys', 'stfu', 'gtfo',
];

// Normalise leet-speak / spaced letters so bypasses are caught
function normalise(text) {
  return text
    .toLowerCase()
    .replace(/4/g, 'a')
    .replace(/3/g, 'e')
    .replace(/1/g, 'i')
    .replace(/0/g, 'o')
    .replace(/5/g, 's')
    .replace(/\$/g, 's')
    .replace(/@/g, 'a')
    .replace(/\*/g, '')
    .replace(/\s+/g, ' ');
}

function containsInsult(text) {
  const norm = normalise(text);
  return insultWords.some(word => {
    const escaped = word.replace(/-/g, '[\\s-]?');
    return new RegExp(`\\b${escaped}\\b`, 'i').test(norm);
  });
}

// ── Replies ───────────────────────────────────────────────────────────────
  (user) => `Whoa, did ${user} steal your lunch money or something? Chill idiot.`,
  (user) => `Sir, this is a Wendy's... let's leave ${user} out of this shit.`,
  (user) => `My sensors are detecting dangerously high salt levels bullshit towards ${user}.`,
  (user) => `Show some mercy, ${user} has a family dumbass!`,
  (user) => `Keyboard warrior mode: OFF. Let's be nice to ${user} jackass.`,
  (user) => `Error 404: Chill not found. Give ${user} a break, wanker.`,
  (user) => `It’s never that serious. Let's keep it friendly for ${user}, asshole.`,
  (user) => `Don't make me get the ban hammer bastard, out to protect ${user}`,
  (user) => `Breathe in, breathe out... and leave ${user} alone, dipshit.`,
  (user) => `Whoa, save some of that aggression for matchday. Leave ${user} chilling in his shit.`

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── Main handler ──────────────────────────────────────────────────────────
export async function handleAutomodSwear(message) {
  if (message.author.bot) return;
  if (!message.guild) return;
  if (!message.content) return;

  // Only fire if at least one real user is mentioned
  const mentionedUsers = message.mentions.users.filter(u => !u.bot && u.id !== message.author.id);
  if (mentionedUsers.size === 0) return;

  // Only fire if the message also contains an insult
  if (!containsInsult(message.content)) return;

  // Pick the first mentioned user as the "target" for the reply
  const target = mentionedUsers.first();

  await message.reply({
    content: pickRandom(replies)(target),
    allowedMentions: { repliedUser: true, users: [] },
  }).catch(() => null);
}

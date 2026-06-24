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
const replies = [
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
]

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── Bot-directed roast replies (when someone insults the bot itself) ──────
const selfRoastReplies = [
  (user) => `Nice try ${user}, I've been called worse by better people.`,
  (user) => `${user} really woke up and chose violence today huh.`,
  (user) => `Aww ${user}, did I touch a nerve? That's adorable.`,
  (user) => `${user} out here typing with their whole chest lmaooo.`,
  (user) => `${user} I'm a bot. I literally cannot feel pain. You good?`,
  (user) => `Bold words for someone in my reply range, ${user}.`,
  (user) => `${user} said that like it was gonna hurt. Cute.`,
  (user) => `${user} I was built different. Try harder next time.`,
];

// ── Main handler ──────────────────────────────────────────────────────────
export async function handleAutomodSwear(message) {
  if (message.author.bot) return;
  if (!message.guild) return;
  if (!message.content) return;

  // Only fire if the message contains an insult
  if (!containsInsult(message.content)) return;

  const botMentioned = message.mentions.users.has(message.client.user.id);

  // If the bot itself is mentioned, roast the sender
  if (botMentioned) {
    await message.channel.send({
      reply: { messageReference: message.id },
      content: pickRandom(selfRoastReplies)(message.author),
      allowedMentions: { repliedUser: true, users: [] },
    }).catch(() => null);
    return;
  }

  // Proper Discord mention of another real user
  const mentionedUsers = message.mentions.users.filter(u => !u.bot && u.id !== message.author.id);
  if (mentionedUsers.size > 0) {
    const target = mentionedUsers.first();
    await message.channel.send({
      reply: { messageReference: message.id },
      content: pickRandom(replies)(target),
      allowedMentions: { repliedUser: true, users: [] },
    }).catch(() => null);
    return;
  }

  // Plain-text @mention (user typed @name without autocomplete) + insult
  // Check for any @ symbol in the message targeting someone
  if (/@\S/.test(message.content)) {
    await message.channel.send({
      reply: { messageReference: message.id },
      content: pickRandom(replies)(message.mentions.users.first() ?? 'them'),
      allowedMentions: { repliedUser: true, users: [] },
    }).catch(() => null);
  }
}

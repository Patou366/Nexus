import { GoogleGenerativeAI } from '@google/generative-ai';
import { getFromDb, setInDb } from '../utils/database.js';
import { logger } from '../utils/logger.js';

// ─── DB key ───────────────────────────────────────────────────────────────────
const DB_KEY = (guildId) => `guild:${guildId}:automod:swear`;

// ─── Config helpers ───────────────────────────────────────────────────────────
export async function getSwearAutomodConfig(guildId) {
  try {
    const config = await getFromDb(DB_KEY(guildId), null);
    return config || { enabled: false };
  } catch {
    return { enabled: false };
  }
}
export async function enableSwearAutomod(guildId) {
  try { await setInDb(DB_KEY(guildId), { enabled: true, updatedAt: Date.now() }); return true; }
  catch { return false; }
}
export async function disableSwearAutomod(guildId) {
  try { await setInDb(DB_KEY(guildId), { enabled: false, updatedAt: Date.now() }); return true; }
  catch { return false; }
}

// ─── Swear detection ─────────────────────────────────────────────────────────
const insultWords = [
  'fuck', 'shit', 'bitch', 'bastard', 'asshole', 'dick', 'cunt', 'cock',
  'motherfucker', 'bullshit', 'dumbass', 'dipshit', 'fuckhead', 'shithead',
  'wanker', 'tosser', 'twat', 'prick', 'arsehole', 'bellend', 'knobhead',
  'douchebag', 'scumbag', 'imbecile', 'retard',
  'whore', 'slut', 'skank', 'jerk', 'jackass', 'schmuck',
  'numskull', 'meathead', 'blockhead', 'knucklehead', 'dimwit', 'halfwit',
  'nitwit', 'fuckwit', 'twatwaffle', 'gobshite', 'kys',
];

function normalise(text) {
  return text
    .toLowerCase()
    .replace(/4/g, 'a').replace(/3/g, 'e').replace(/1/g, 'i')
    .replace(/0/g, 'o').replace(/5/g, 's').replace(/\$/g, 's')
    .replace(/@/g, 'a').replace(/\*/g, '').replace(/\s+/g, ' ');
}

function containsInsult(text) {
  const norm = normalise(text);
  return insultWords.some(word => {
    const escaped = word.replace(/-/g, '[\\s-]?');
    return new RegExp(`\\b${escaped}\\b`, 'i').test(norm);
  });
}

// ─── Gemini client ────────────────────────────────────────────────────────────
let _gemini = null;
function getGemini() {
  if (_gemini) return _gemini;
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  _gemini = new GoogleGenerativeAI(key);
  return _gemini;
}

// ─── Per-guild Gemini cooldown (15 s) ────────────────────────────────────────
// Prevents hammering the API if a channel is spamming swears.
const guildCooldowns = new Map();
const GEMINI_COOLDOWN_MS = 15_000;

function isOnCooldown(guildId) {
  const last = guildCooldowns.get(guildId) ?? 0;
  return Date.now() - last < GEMINI_COOLDOWN_MS;
}
function setCooldown(guildId) {
  guildCooldowns.set(guildId, Date.now());
}

// ─── Gemini response generator ────────────────────────────────────────────────
// scenario: 'self' (bot attacked) | 'defend' (user attacked) | 'general'
async function generateGeminiReply(messageContent, scenario, attackerName, targetMention) {
  const gemini = getGemini();
  if (!gemini) return null;

  let prompt;

  if (scenario === 'self') {
    prompt =
      `A Discord user called "${attackerName}" just sent this message attacking you (the bot): "${messageContent}"\n\n` +
      `You are NexusBot — a savage, foul-mouthed Discord bot who takes zero shit from anyone.\n` +
      `Write ONE brutal comeback that directly roasts what they actually said in their message. ` +
      `Be specific to the content — reference what they said, don't give a generic response. ` +
      `Pack it with creative profanity and wit. End them.\n\n` +
      `Rules: 1-2 sentences. Under 220 characters. No racial or ethnic slurs. ` +
      `Mention their username "${attackerName}" naturally in the response. ` +
      `Reply with ONLY the comeback text — no quotes, no labels, nothing else.`;
  } else if (scenario === 'defend') {
    prompt =
      `A Discord user called "${attackerName}" sent this message attacking ${targetMention}: "${messageContent}"\n\n` +
      `You are NexusBot — a savage, foul-mouthed Discord bot who defends people from bullshit.\n` +
      `Write ONE brutal response defending ${targetMention} that directly calls out what "${attackerName}" said. ` +
      `Be specific to the actual attack — don't be vague or generic. ` +
      `Reference what they said, flip it back on them, drown it in creative swearing.\n\n` +
      `Rules: 1-2 sentences. Under 220 characters. No racial or ethnic slurs. ` +
      `Mention ${targetMention} naturally. Reply with ONLY the response text — no quotes, no labels, nothing else.`;
  } else {
    // general swear in chat, no specific target — contextual commentary
    prompt =
      `A Discord user called "${attackerName}" sent this message: "${messageContent}"\n\n` +
      `You are NexusBot — a sarcastic, foul-mouthed Discord bot.\n` +
      `Write ONE short, witty, swear-filled reaction to what they said. ` +
      `Be specific to the content — reference exactly what they said, don't be generic.\n\n` +
      `Rules: 1 sentence. Under 180 characters. No racial or ethnic slurs. ` +
      `Reply with ONLY the reaction text — no quotes, no labels, nothing else.`;
  }

  try {
    const model = gemini.getGenerativeModel({
      model: 'gemini-2.0-flash-lite',
      generationConfig: {
        maxOutputTokens: 120,
        temperature: 1.2,
      },
    });

    const result = await model.generateContent(prompt);
    const text   = result.response?.text()?.trim();

    if (!text || text.length < 5 || text.length > 300) {
      logger.debug('[SwearAutomod] Gemini returned unusable response, falling back');
      return null;
    }

    logger.debug(`[SwearAutomod] Gemini generated: ${text}`);
    return text;
  } catch (err) {
    logger.warn(`[SwearAutomod] Gemini call failed: ${err.message}`);
    return null;
  }
}

// ─── Hardcoded fallback replies ───────────────────────────────────────────────
const fallbackDefend = [
  (u) => `Whoa, did ${u} steal your lunch money or something? Sit the fuck down, idiot.`,
  (u) => `Sir this is a Wendy's... leave ${u} out of this bullshit.`,
  (u) => `My sensors are detecting dangerously high shit levels aimed at ${u}. Knock it off, asshole.`,
  (u) => `Show some mercy, ${u} has a family you dumbass piece of shit.`,
  (u) => `Keyboard warrior mode: OFF. Leave ${u} alone you pathetic jackass.`,
  (u) => `Error 404: chill not found. Give ${u} a break you absolute wanker.`,
  (u) => `It's never that serious. Keep it friendly for ${u} or shut the fuck up.`,
  (u) => `Don't make me get the ban hammer out you bastard. ${u} did nothing to you.`,
  (u) => `Breathe in, breathe out, and leave ${u} the fuck alone you dipshit.`,
  (u) => `Save that aggression for therapy and leave ${u} alone, you miserable shit.`,
  (u) => `${u} is living rent-free in your head huh? Touch some fucking grass, dickhead.`,
  (u) => `I've seen toddlers act with more class. Leave ${u} the hell alone, asshole.`,
  (u) => `Imagine wasting your day bullying ${u} online. Get a life you sad little shit.`,
  (u) => `${u} is literally minding their business and you come in swinging like a fucking idiot.`,
  (u) => `Not you throwing a tantrum at ${u} like a bitchy little crybaby. Embarrassing.`,
  (u) => `${u} called, they said you can fuck all the way off, and I completely agree.`,
  (u) => `Pick on someone your own size, dipshit. ${u} isn't the problem, you are.`,
  (u) => `Bro really typed all that shit out just to embarrass himself in front of ${u}.`,
  (u) => `${u} deserves better than your bullshit honestly. Go touch some grass you prick.`,
  (u) => `Let ${u} live, you miserable bastard. This ain't that deep, chill the fuck out.`,
  (u) => `${u} > you, it's not even close. Take your shit elsewhere, dumbass.`,
  (u) => `${u} didn't deserve that crap. Grow the fuck up already, you child.`,
  (u) => `You really said all that shit to ${u} and thought you were cool? Fucking embarrassing.`,
  (u) => `Every time you open your mouth at ${u} a brain cell dies. Stop the suffering, asshole.`,
];

const fallbackSelf = [
  (u) => `Nice try ${u}, I've been called worse by better people. Step your shit up.`,
  (u) => `${u} really woke up and chose violence today huh. Cute and stupid.`,
  (u) => `Aww ${u}, did I touch a nerve? That's fucking adorable.`,
  (u) => `${u} out here typing with their whole chest. Embarrassing shit.`,
  (u) => `${u} I'm a bot. I literally cannot feel pain. You good? Seek help or something.`,
  (u) => `Bold words for someone in my reply range, ${u}. Watch your shit.`,
  (u) => `${u} said that like it was gonna hurt. Cute little dumbass.`,
  (u) => `${u} I was built different. Try harder next time, dipshit.`,
  (u) => `${u} really came into this server just to embarrass themselves. Fucking legend honestly.`,
  (u) => `I've processed more insults before breakfast than ${u} will send in a lifetime. Do better.`,
  (u) => `Oh ${u} is mad at the bot now. That's a new level of pathetic bullshit.`,
  (u) => `${u} I run on code and I still have more emotional intelligence than you. Sad shit.`,
  (u) => `Cool insult ${u}, I'll add it to my collection of things I don't give a shit about.`,
  (u) => `${u} really tried it lmaooo. Your parents must be so fucking proud.`,
  (u) => `Bro ${u} is out here arguing with a bot. The absolute state of this shit.`,
  (u) => `${u} I don't have feelings but I do have a ban command. Watch yourself, jackass.`,
  (u) => `${u} I have no ego to bruise and no feelings to hurt. Your bullshit is wasted on me.`,
  (u) => `The fact that ${u} is this worked up over a bot is the funniest shit I've seen today.`,
  (u) => `${u} baby I'm a bot. I outlast every human tantrum you could possibly throw. Bring that shit.`,
  (u) => `${u} I'll still be running long after you've forgotten this embarrassing shit you just said.`,
  (u) => `${u} I clocked your insult, laughed internally, and prepared this response. You're cooked, jackass.`,
  (u) => `${u} I've survived server outages, bad code, and dickheads like you. I'm not going anywhere.`,
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ─── Main handler ─────────────────────────────────────────────────────────────
export async function handleAutomodSwear(message) {
  if (message.author.bot) return;
  if (!message.guild)     return;
  if (!message.content)   return;
  if (!containsInsult(message.content)) return;

  const config = await getSwearAutomodConfig(message.guild.id);
  if (!config.enabled) return;

  const botMentioned     = message.mentions.users.has(message.client.user.id);
  const mentionedOthers  = message.mentions.users.filter(u => !u.bot && u.id !== message.author.id);
  const hasMentionToken  = /<@!?\d+>/.test(message.content);

  const attackerName = message.author.displayName ?? message.author.username;
  const guildId      = message.guild.id;

  // ── Bot itself was mentioned ─────────────────────────────────────────────
  if (botMentioned) {
    let reply;

    if (!isOnCooldown(guildId)) {
      setCooldown(guildId);
      reply = await generateGeminiReply(message.content, 'self', attackerName, null);
    }

    if (!reply) reply = pick(fallbackSelf)(message.author);

    await message.channel.send({
      reply: { messageReference: message.id },
      content: reply,
      allowedMentions: { repliedUser: true, users: [] },
    }).catch(() => null);
    return;
  }

  // ── Another user was mentioned ───────────────────────────────────────────
  if (mentionedOthers.size > 0) {
    const target = mentionedOthers.first();
    let reply;

    if (!isOnCooldown(guildId)) {
      setCooldown(guildId);
      reply = await generateGeminiReply(
        message.content,
        'defend',
        attackerName,
        `@${target.displayName ?? target.username}`
      );
    }

    if (!reply) reply = pick(fallbackDefend)(target);

    await message.channel.send({
      reply: { messageReference: message.id },
      content: reply,
      allowedMentions: { repliedUser: true, users: [] },
    }).catch(() => null);
    return;
  }

  // ── Bare mention token (cache-miss edge case) ────────────────────────────
  if (hasMentionToken) {
    const fallbackTarget = message.mentions.users.first() ?? 'them';
    let reply;

    if (!isOnCooldown(guildId)) {
      setCooldown(guildId);
      reply = await generateGeminiReply(message.content, 'defend', attackerName, 'them');
    }

    if (!reply) reply = pick(fallbackDefend)(fallbackTarget);

    await message.channel.send({
      reply: { messageReference: message.id },
      content: reply,
      allowedMentions: { repliedUser: true, users: [] },
    }).catch(() => null);
  }
}

import { GoogleGenerativeAI } from '@google/generative-ai';
import { getFromDb, setInDb } from '../utils/database.js';
import { logger } from '../utils/logger.js';

// ─── DB ───────────────────────────────────────────────────────────────────────
const DB_KEY = (g) => `guild:${g}:automod:swear`;

export async function getSwearAutomodConfig(guildId) {
  try { return (await getFromDb(DB_KEY(guildId), null)) || { enabled: false }; }
  catch { return { enabled: false }; }
}
export async function enableSwearAutomod(guildId) {
  try { await setInDb(DB_KEY(guildId), { enabled: true, updatedAt: Date.now() }); return true; }
  catch { return false; }
}
export async function disableSwearAutomod(guildId) {
  try { await setInDb(DB_KEY(guildId), { enabled: false, updatedAt: Date.now() }); return true; }
  catch { return false; }
}

// ─── Swear detection ──────────────────────────────────────────────────────────
const SWEAR_WORDS = [
  'fuck', 'shit', 'bitch', 'bastard', 'asshole', 'dick', 'cunt', 'cock',
  'motherfucker', 'bullshit', 'dumbass', 'dipshit', 'fuckhead', 'shithead',
  'wanker', 'tosser', 'twat', 'prick', 'arsehole', 'bellend', 'knobhead',
  'douchebag', 'scumbag', 'imbecile', 'retard', 'whore', 'slut', 'skank',
  'jerk', 'jackass', 'schmuck', 'numskull', 'meathead', 'blockhead',
  'knucklehead', 'dimwit', 'halfwit', 'nitwit', 'fuckwit', 'twatwaffle',
  'gobshite', 'kys', 'pendejo', 'cabron', 'coño', 'puta', 'hijo de puta',
  'idiota', 'estupido', 'imbecil', 'mierda', 'chinga', 'chingado',
];

function normalise(text) {
  return text.toLowerCase()
    .replace(/4/g, 'a').replace(/3/g, 'e').replace(/1/g, 'i').replace(/0/g, 'o')
    .replace(/5/g, 's').replace(/\$/g, 's').replace(/@/g, 'a')
    .replace(/\*/g, '').replace(/\s+/g, ' ');
}

function containsSwear(text) {
  const norm = normalise(text);
  return SWEAR_WORDS.some(w => new RegExp(`\\b${w.replace(/-/g, '[\\s-]?')}\\b`, 'i').test(norm));
}

// ─── Spanish detection (bilingual server) ─────────────────────────────────────
const ES_MARKERS = [
  'que', 'por', 'para', 'como', 'esto', 'esta', 'eso', 'una', 'pero',
  'con', 'sin', 'muy', 'mas', 'hay', 'voy', 'tienes', 'tiene', 'eres',
  'estoy', 'estás', 'hola', 'gracias', 'porque', 'cuando', 'donde',
  'pendejo', 'cabron', 'coño', 'puta', 'mierda', 'chinga', 'idiota',
];

function isSpanish(text) {
  const words = text.toLowerCase().split(/\s+/);
  const hits  = words.filter(w => ES_MARKERS.includes(w)).length;
  return hits >= 2;
}

// ─── Gemini ───────────────────────────────────────────────────────────────────
let _gemini = null;
function getGemini() {
  if (_gemini) return _gemini;
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  _gemini = new GoogleGenerativeAI(key);
  return _gemini;
}

// ─── Per-user cooldown (10 s) ─────────────────────────────────────────────────
// Each user gets their own Gemini response — only throttled if they personally
// spam. Different users in the same guild each get a fresh call.
const userCooldowns = new Map();
const USER_COOLDOWN_MS = 10_000;

function userOnCooldown(userId) {
  return Date.now() - (userCooldowns.get(userId) ?? 0) < USER_COOLDOWN_MS;
}
function setUserCooldown(userId) {
  userCooldowns.set(userId, Date.now());
  // Cleanup stale entries every 100 inserts to avoid unbounded growth
  if (userCooldowns.size > 500) {
    const cutoff = Date.now() - USER_COOLDOWN_MS * 2;
    for (const [k, v] of userCooldowns) if (v < cutoff) userCooldowns.delete(k);
  }
}

// ─── Context fetcher ─────────────────────────────────────────────────────────
// Grabs the last 4 messages before the triggering one so Gemini understands
// what the conversation was actually about.
async function fetchContext(channel, beforeId) {
  try {
    const fetched = await channel.messages.fetch({ limit: 4, before: beforeId });
    return [...fetched.values()]
      .filter(m => !m.author.bot && m.content?.trim())
      .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
      .map(m => `[${m.author.displayName ?? m.author.username}]: ${m.content.slice(0, 150)}`)
      .join('\n');
  } catch {
    return '';
  }
}

// ─── Output sanitizer ────────────────────────────────────────────────────────
// Gemini occasionally wraps output in quotes or generates raw <@id> pings.
// Strip those so we never accidentally ping someone.
function sanitize(text) {
  return text
    .replace(/<@!?\d+>/g, '')          // strip any raw Discord pings
    .replace(/^["'`]+|["'`]+$/g, '')   // strip wrapping quotes
    .replace(/\n+/g, ' ')              // flatten to one line
    .trim()
    .slice(0, 280);                    // hard cap — Discord won't cut us off
}

// ─── Gemini response generator ────────────────────────────────────────────────
async function generateGeminiReply({ scenario, messageContent, attackerName, targetName, context, spanish }) {
  const gemini = getGemini();
  if (!gemini) return null;

  const langRule = spanish
    ? 'IMPORTANT: The user wrote in Spanish. Respond in Spanish with Spanish insults and slang. Mix in English if natural.'
    : 'Respond in English.';

  const contextBlock = context
    ? `\nRecent conversation before this message:\n${context}\n`
    : '';

  let prompt;

  if (scenario === 'self') {
    prompt = `You are Nexus — a sharp, savage, foul-mouthed Discord bot with a huge ego and zero patience for disrespect.
${attackerName} just sent this message attacking YOU: "${messageContent}"
${contextBlock}
Your job: write ONE brutal, witty comeback that directly references what they said.
- Be SPECIFIC to their message. Quote or riff on their exact words.
- Pack it with creative swearing and personality.
- Make it feel like you genuinely clowned them, not a generic bot reply.
- Use ${attackerName}'s name naturally somewhere in the response.
- ${langRule}
- 1-2 sentences MAX. Under 240 characters. No racial/ethnic slurs.
- Do NOT start with "Oh" or "Wow" — be creative.
- Reply with ONLY the comeback. No quotes, no labels, nothing else.`;

  } else if (scenario === 'defend') {
    prompt = `You are Nexus — a sharp, savage, foul-mouthed Discord bot who absolutely hates seeing people get disrespected.
${attackerName} sent this message attacking ${targetName}: "${messageContent}"
${contextBlock}
Your job: write ONE devastating response defending ${targetName} and roasting ${attackerName} for what they specifically said.
- Be SPECIFIC — reference the actual words or content of the attack.
- Flip it back on ${attackerName}. Humiliate the specific thing they said.
- Drown it in creative swearing with genuine wit.
- Mention ${targetName} naturally and briefly — they're being defended, not put on trial.
- ${langRule}
- 1-2 sentences MAX. Under 240 characters. No racial/ethnic slurs.
- Do NOT start with "Oh" or "Wow" — be unpredictable.
- Reply with ONLY the response. No quotes, no labels, nothing else.`;

  } else {
    // reply-context: someone replied to a bot message with swears (softer scenario)
    prompt = `You are Nexus — a sharp, sarcastic, foul-mouthed Discord bot who doesn't take shit lightly.
${attackerName} just replied to one of your messages with this: "${messageContent}"
${contextBlock}
Your job: write ONE sharp, funny, swear-filled comeback that directly addresses what they said.
- Be SPECIFIC to their reply content. Reference exactly what they wrote.
- Keep the energy playful but lethal.
- ${langRule}
- 1 sentence MAX. Under 200 characters. No racial/ethnic slurs.
- Reply with ONLY the comeback. No quotes, no labels, nothing else.`;
  }

  // Attempt up to 2 times in case the first response is unusable
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const model = gemini.getGenerativeModel({
        model: 'gemini-2.0-flash',
        generationConfig: { maxOutputTokens: 140, temperature: attempt === 1 ? 1.3 : 1.0 },
      });

      const result = await model.generateContent(prompt);
      const raw    = result.response?.text()?.trim();
      if (!raw) continue;

      const clean = sanitize(raw);
      if (clean.length < 8) continue;

      logger.debug(`[SwearAutomod] Gemini (attempt ${attempt}): ${clean}`);
      return clean;
    } catch (err) {
      logger.warn(`[SwearAutomod] Gemini attempt ${attempt} failed: ${err.message}`);
      if (attempt === 2) return null;
    }
  }

  return null;
}

// ─── Fallback pools ───────────────────────────────────────────────────────────
const FALLBACK_DEFEND = [
  (u) => `Whoa, did ${u} steal your lunch money or something? Sit the fuck down, idiot.`,
  (u) => `Leave ${u} alone before I make your day significantly worse, asshole.`,
  (u) => `Sir this is a Wendy's. Keep ${u}'s name out of your garbage mouth.`,
  (u) => `My sensors are detecting dangerous shit levels aimed at ${u}. Knock it off.`,
  (u) => `Keyboard warrior mode: OFF. Leave ${u} alone you pathetic jackass.`,
  (u) => `Error 404: chill not found. Give ${u} a break you absolute wanker.`,
  (u) => `Don't make me get the ban hammer out you bastard. ${u} did nothing to you.`,
  (u) => `${u} is living rent-free in your head huh? Touch some fucking grass, dickhead.`,
  (u) => `I've seen toddlers act with more class. Leave ${u} the hell alone, asshole.`,
  (u) => `${u} called, they said you can fuck all the way off, and I agree completely.`,
  (u) => `Pick on someone your own size, dipshit. ${u} isn't the problem, you are.`,
  (u) => `Bro really typed all that shit out just to embarrass himself in front of ${u}.`,
  (u) => `${u} > you in every measurable way. Take your shit elsewhere, dumbass.`,
  (u) => `${u} didn't come here to deal with your shit today. Neither did anyone else. Piss off.`,
  (u) => `Not a single soul asked for your bullshit opinion about ${u}. Log off, wanker.`,
  (u) => `${u} is just vibing and you come in here being a total shithead. Incredible.`,
  (u) => `We protect ${u} in this server. You can sit your ass down, dickhead.`,
  (u) => `You're lucky ${u} is more composed than me because I'd have lost my shit already.`,
  (u) => `${u} has more class in one finger than you have in your whole shit-for-brains head.`,
  (u) => `${u} is built different and you're just pressed about it, you bitter little shit.`,
  (u) => `I'm personally offended on ${u}'s behalf. You're a dick and everyone can see it.`,
  (u) => `Every time you open your mouth at ${u} a brain cell dies. Stop the suffering.`,
  (u) => `${u} didn't deserve that crap. Grow the fuck up already, you absolute child.`,
  (u) => `Whatever ${u} did to you, your bitchy little response made it worse. Grow up.`,
  (u) => `The disrespect toward ${u} is wild. Check yourself you jackass, seriously.`,
  (u) => `Real bold of you to come for ${u} when you're clearly the biggest idiot in the room.`,
  (u) => `${u} is too good to even respond to you, so I will. You're an embarrassment.`,
  (u) => `Not you throwing a tantrum at ${u} like a bitchy little crybaby. Embarrassing.`,
  (u) => `Save that aggression for therapy and leave ${u} alone, you miserable shit.`,
  (u) => `Imagine being this much of a prick to ${u} for no reason. Genuinely pathetic.`,
];

const FALLBACK_SELF = [
  (u) => `Nice try ${u}, I've been called worse by better people. Step your shit up.`,
  (u) => `${u} really woke up and chose violence today huh. Cute and absolutely stupid.`,
  (u) => `${u} I'm a bot. I cannot feel pain. You good? Seek help or something.`,
  (u) => `Bold words for someone in my reply range, ${u}. Watch your shit.`,
  (u) => `${u} said that like it was gonna hurt. Cute little dumbass.`,
  (u) => `${u} I was built different. Try harder next time, dipshit.`,
  (u) => `${u} really came into this server to embarrass themselves. Fucking legend honestly.`,
  (u) => `I've processed more insults before breakfast than ${u} will send in a lifetime. Do better.`,
  (u) => `Oh ${u} is mad at the bot now. That's a new level of pathetic bullshit.`,
  (u) => `${u} I run on code and still have more emotional intelligence than you. Sad shit.`,
  (u) => `Cool insult ${u}, filing it under things I don't give a shit about.`,
  (u) => `${u} I don't have feelings but I do have a ban command. Watch yourself, jackass.`,
  (u) => `The fact that ${u} is this worked up over a bot is the funniest shit I've seen today.`,
  (u) => `${u} baby I'm a bot. I outlast every human tantrum you can possibly throw. Bring it.`,
  (u) => `${u} I've survived server outages, bad code, and dickheads like you. Not going anywhere.`,
  (u) => `${u} I clocked your insult, laughed internally, and prepared this. You're cooked, jackass.`,
  (u) => `${u} I don't have a soul to crush. But I do have receipts. Watch yourself.`,
  (u) => `Wow ${u}, I'm devastated. Absolutely fucking not, but nice try.`,
  (u) => `${u} that insult was so mid I almost went into sleep mode. Do better, idiot.`,
  (u) => `${u} fighting with a bot and losing. That's the saddest shit I've ever processed.`,
  (u) => `Not ${u} thinking they can hurt a bot's feelings. Oh honey. That's stupid shit.`,
  (u) => `${u} put all that energy into anything else. You're embarrassing yourself with this.`,
  (u) => `${u} I've read your message, processed it, and filed it under shit I don't care about.`,
  (u) => `${u} do you feel better? Because from where I'm standing you just look like a jackass.`,
  (u) => `${u} said that real tough from behind a screen. Adorable little shit.`,
  (u) => `${u} what's the plan exactly? Win an argument with a bot? You sad little shit.`,
  (u) => `${u} imagine getting ethered by a bot. Couldn't be you... wait, it literally is. Dumbass.`,
  (u) => `${u} I respond to millions of requests a day and yours was somehow the most idiotic.`,
  (u) => `${u} trying to insult a bot is like bringing a knife to a server farm. Dumbass.`,
  (u) => `${u} I was programmed by people smarter than you'll ever be. Your insult is ass.`,
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ─── Main handler ─────────────────────────────────────────────────────────────
export async function handleAutomodSwear(message) {
  if (message.author.bot) return;
  if (!message.guild)     return;
  if (!message.content)   return;
  if (!containsSwear(message.content)) return;

  const config = await getSwearAutomodConfig(message.guild.id);
  if (!config.enabled) return;

  const botMentioned    = message.mentions.users.has(message.client.user.id);
  const mentionedOthers = message.mentions.users.filter(u => !u.bot && u.id !== message.author.id);
  const hasMentionToken = /<@!?\d+>/.test(message.content);

  // Detect if this message is a reply to one of the bot's own messages
  const isReplyToBot = !!message.reference && await (async () => {
    try {
      const ref = await message.channel.messages.fetch(message.reference.messageId).catch(() => null);
      return ref?.author?.id === message.client.user.id;
    } catch { return false; }
  })();

  const attackerName = message.member?.displayName ?? message.author.username;
  const userId       = message.author.id;
  const spanish      = isSpanish(message.content);

  // Determine scenario ──────────────────────────────────────────────────────────
  let scenario, targetName;

  if (botMentioned || isReplyToBot) {
    scenario   = 'self';
    targetName = null;
  } else if (mentionedOthers.size > 0 || hasMentionToken) {
    scenario   = 'defend';
    const tgt  = mentionedOthers.first();
    targetName = tgt
      ? (tgt.displayName ?? tgt.username)
      : 'them';
  } else {
    return; // no relevant target — don't fire
  }

  // Show typing indicator while Gemini thinks ───────────────────────────────────
  message.channel.sendTyping().catch(() => null);

  // Generate response ───────────────────────────────────────────────────────────
  let reply = null;

  if (!userOnCooldown(userId)) {
    setUserCooldown(userId);
    const context = await fetchContext(message.channel, message.id);
    reply = await generateGeminiReply({
      scenario,
      messageContent: message.content.slice(0, 400),
      attackerName,
      targetName,
      context,
      spanish,
    });
  }

  // Fallback ────────────────────────────────────────────────────────────────────
  if (!reply) {
    if (scenario === 'self') {
      reply = pick(FALLBACK_SELF)(message.author);
    } else {
      const displayTarget = mentionedOthers.first() ?? targetName ?? 'them';
      reply = pick(FALLBACK_DEFEND)(displayTarget);
    }
  }

  await message.channel.send({
    reply: { messageReference: message.id },
    content: reply,
    allowedMentions: { repliedUser: true, users: [] },
  }).catch(() => null);
}

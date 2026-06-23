import { getFromDb, setInDb } from '../utils/database.js';
import { logger } from '../utils/logger.js';

// ── DB keys ───────────────────────────────────────────────────────────────
const getSwearAutomodKey = (guildId)        => `guild:${guildId}:swear_automod`;
const getHeatScoreKey    = (guildId, userId) => `guild:${guildId}:heat:${userId}`;

// ── Config ────────────────────────────────────────────────────────────────
const HEAT_WINDOW_MS     = 10 * 60 * 1000; // session resets after 10 min of inactivity
const HEAT_CALLOUT_EVERY = 5;              // public callout every N cumulative heat points
const FREQ_TIER_BUMP     = 3;              // 3+ swears in one message → bump tier +1
const FREQ_UNHINGED      = 5;              // 5+ swears in one message → unhinged pool

// ── In-memory session tracker (resets per user per 10 min window) ─────────
// key: `${guildId}:${userId}` → { count, windowStart }
const sessionTracker = new Map();

function getSession(guildId, userId) {
  const key = `${guildId}:${userId}`;
  const now = Date.now();
  const existing = sessionTracker.get(key);
  if (!existing || now - existing.windowStart >= HEAT_WINDOW_MS) {
    const fresh = { count: 0, windowStart: now };
    sessionTracker.set(key, fresh);
    return fresh;
  }
  return existing;
}

function incrementSession(guildId, userId) {
  const session = getSession(guildId, userId);
  session.count += 1;
  sessionTracker.set(`${guildId}:${userId}`, session);
  return session.count;
}

// ── DB-persisted cumulative heat score ────────────────────────────────────
async function getHeatScore(guildId, userId) {
  try {
    const data = await getFromDb(getHeatScoreKey(guildId, userId), null);
    return data?.score ?? 0;
  } catch {
    return 0;
  }
}

async function incrementHeatScore(guildId, userId, by = 1) {
  try {
    const current  = await getHeatScore(guildId, userId);
    const newScore = current + by;
    await setInDb(getHeatScoreKey(guildId, userId), { score: newScore, updatedAt: Date.now() });
    return newScore;
  } catch {
    return 0;
  }
}

// ── Trigger words ─────────────────────────────────────────────────────────
const triggerWords = [
  // Core classics
  'fuck', 'shit', 'bitch', 'ass', 'bastard', 'damn', 'crap', 'hell',
  'piss', 'dick', 'cunt', 'cock', 'asshole', 'motherfucker', 'bullshit',
  'jackass', 'dumbass', 'dipshit', 'fuckhead', 'shithead',

  // Fuck variants
  'fucker', 'fucked', 'fucking', 'fucks', 'fuckup', 'fuckoff', 'fuckboy',
  'fuckface', 'fucknut', 'fuckwit', 'clusterfuck', 'mindfuck', 'motherfucking',
  'abso-fucking-lutely', 'un-fucking-believable', 'godfuckingdamnit',
  'fuckstick', 'fuckass', 'fuckpig', 'fuckbucket',
  'holy-fucking-shit', 'what-the-fuck', 'shut-the-fuck-up',

  // Shit variants
  'shitty', 'shitter', 'shitting', 'shitbag', 'shitstorm', 'shitstain',
  'shitshow', 'bullshitter', 'horseshit', 'apeshit', 'batshit', 'dogshit',
  'ratshit', 'chickenshit', 'pigshit', 'nutshit', 'shitbird', 'shitbrick',
  'shitface', 'shitgibbon', 'full-of-shit', 'piece-of-shit', 'shit-for-brains',
  'shit-eating', 'shit-faced', 'shit-hole', 'shit-bag', 'holy-shit',

  // Ass variants
  'asses', 'asshat', 'asswipe', 'assclown', 'assbag', 'assface',
  'asshead', 'assmonger', 'ass-wipe', 'smartass', 'wiseass', 'hardass',
  'badass', 'halfass', 'lardass', 'fatass', 'lazyass', 'tightass',
  'butthead', 'buttface', 'butthole', 'butt', 'kiss-my-ass',
  'ass-hat', 'ass-clown', 'ass-wipe', 'ass-face', 'ass-hole',
  'get-your-ass', 'dumb-ass', 'jack-ass', 'horse-ass',

  // Dick variants
  'dicks', 'dickhead', 'dickface', 'dickwad', 'dickweed', 'dickbag',
  'dickmonger', 'dickbreath', 'limp-dick', 'dickish', 'dick-face',
  'dick-head', 'dick-bag', 'dick-weed', 'dick-breath',

  // Cock variants
  'cocks', 'cockhead', 'cocksucker', 'cockwomble', 'cockup', 'cocknugget',
  'cock-up', 'cock-head', 'cock-sucker', 'cock-womble', 'cock-nugget',

  // Bitch variants
  'bitchy', 'bitches', 'bitchin', 'son-of-a-bitch', 'son-of-a-gun',
  'bitch-ass', 'little-bitch', 'basic-bitch',

  // Cunt variants
  'cunts', 'cuntface', 'cuntbag', 'cunt-face', 'cunt-bag',

  // British/international
  'wanker', 'tosser', 'twat', 'prick', 'arsehole', 'arse', 'bellend',
  'knobhead', 'knob', 'muppet', 'pillock', 'numpty', 'bollocks', 'bugger',
  'sod', 'chuffing', 'git', 'numbnuts', 'divvy', 'minger', 'tosspot',
  'twathead', 'twatface', 'manky', 'gobshite', 'eejit', 'thick',
  'bloody-hell', 'what-the-bloody', 'daft-bastard',

  // Compound insults
  'douchebag', 'douche', 'scumbag', 'sleazebag', 'dirtbag', 'slimebag',
  'jagoff', 'jerkoff', 'jerk', 'jackoff', 'turd', 'turdburger', 'turdface',
  'nitwit', 'halfwit', 'dimwit', 'fuckwit', 'twatwaffle',
  'pissbag', 'pissy', 'pissed', 'pisser', 'crybaby', 'moron', 'idiot',
  'imbecile', 'buffoon', 'nincompoop', 'dunce', 'schmuck', 'putz',
  'doofus', 'bozo', 'clodhopper', 'numskull', 'meathead', 'blockhead',
  'knucklehead', 'bonehead', 'pinhead', 'airhead', 'lamebrain',
  'shit-for-brains', 'pea-brain', 'bird-brain', 'no-brain',

  // Slang & internet
  'wtf', 'stfu', 'gtfo', 'omfg', 'lmfao', 'af', 'bs', 'pos',
  'deadass', 'hellhole', 'hellish', 'tf', 'kys',

  // Compound swears
  'son-of-a-bitch', 'rat-bastard', 'dirty-bastard', 'lazy-bastard',
  'dumb-bastard', 'fat-bastard', 'old-bastard', 'piss-ant', 'piss-off',
  'piss-head', 'fuck-face', 'fuck-tard', 'fuck-nugget', 'clusterfuck',
  'shitfuck', 'fuckshit', 'go-fuck-yourself', 'go-to-hell',
  'what-the-hell', 'holy-crap', 'oh-shit', 'damn-it', 'god-damn',
  'god-dammit', 'jesus-christ', 'for-fucks-sake', 'what-the-shit',
  'get-the-fuck-out', 'shut-the-hell-up', 'absolute-shit',

  // Additional explicit
  'whore', 'slut', 'skank', 'tramp', 'sleaze', 'perv', 'creep',
  'loser', 'reject', 'degenerate', 'lowlife', 'scoundrel', 'vermin',
  'maggot', 'parasite', 'swine', 'pond-scum', 'waste-of-space',
  'good-for-nothing', 'piece-of-garbage', 'waste-of-air',

  // Leetspeak / bypass attempts
  'f4ck', 'fück', 'sh1t', 'b1tch', 'a55', '@ss', 'a$$',
  'f**k', 's**t', 'b**ch', 'fu*k', 'sh*t',
];

// ── Tier 1 — Mild (first offense this session) ────────────────────────────
const mildComebacks = [
  "Ooh, a swear word. Real fucking brave there, champ. Very impressive shit.",
  "Careful with that mouth, dumbass. First and only friendly warning.",
  "Language, asshole. This is a Discord server, not a fucking construction site.",
  "Oh damn, you said a bad word. Your dumbass mother must be so fucking proud.",
  "Noted. You swear. Cool shit, man. Truly groundbreaking fucking stuff.",
  "Easy there, cowboy — that mouth is gonna get your dumbass in trouble real fast.",
  "Look at you swearing like a big damn kid. Adorable shit, really.",
  "That's one, dumbass. Keep going — I've got all fucking day and no patience.",
  "Swearing in chat — very fucking original, genius. Never seen that shit before.",
  "Yikes. You kiss your mom with that shit-covered mouth, asshole?",
  "Careful. I'm already judging your dumbass and we're only just fucking beginning.",
  "Ah, swearing — the last resort of a dumbass who ran out of actual shit to say.",
  "That's cute, asshole. Real fucking cute. Let's see where this shit goes.",
  "Brave move, dumbass. Bold fucking choice. Noted with full shit-eating judgment.",
  "Oh? We're doing this shit now? Alright, asshole. Your fucking funeral.",
  "Honey, your shit vocabulary is showing. Tuck that fucking bullshit in.",
  "Oof, a swear word. Someone's feeling bold today, dumbass. How fucking original.",
  "I see you chose violence, asshole. Fine. Just know I was being fucking nice before.",
  "One swear. I clocked it, dumbass. We're keeping fucking score now.",
  "This is the calm before the shit storm, asshole. Enjoy it while it fucking lasts.",
];

// ── Tier 2 — Medium (second offense this session) ─────────────────────────
const mediumComebacks = [
  "Oh, you're back for more shit? Your dumbass really didn't learn anything, did it, asshole?",
  "Second time, dipshit. You clearly didn't absorb a single fucking thing from the first warning.",
  "Interesting choice to keep going, dumbass. Let's see how this fucking ends for you.",
  "Still swearing? Still choosing violence, dumbass? Alright, shit-for-brains. Let's fucking go.",
  "You're really doubling down on this bullshit, huh? Brave and fucking stupid — what a combo.",
  "Round two, dumbass. You must genuinely enjoy getting shit on, asshole.",
  "Two swears in and you still haven't learned a damn thing. Fucking incredible.",
  "Your little dumbass is really committed to this shit, huh? Respect the fucking stupidity.",
  "Coming back for more shit? I see. Your dumbass has no survival fucking instincts, asshole.",
  "You're starting to piss me off AND embarrass yourself, dumbass. That's a double fucking achievement.",
  "Bro came back for seconds. The shit-for-brains energy is absolutely strong with this asshole.",
  "Most people stop after one. But not your dumbass — oh no. You're going full fucking send.",
  "Strike two, dipshit. You're not just stupid — you're consistently, reliably fucking stupid.",
  "Two is enough to establish a pattern, asshole — and your pattern is being a complete dumbass.",
  "This is the part where most people stop, shit-for-brains. But here your dumbass is. Fucking incredible.",
  "I gave you a chance and your dumbass wasted it. Again. Like the shit show you fucking are.",
  "Every time you open your stupid shit mouth it gets worse, jackass. That's a real fucking skill.",
  "The fact that you're STILL swearing tells me a lot about your shit judgment, asshole.",
  "Still here, still full of shit, still absolutely clueless. Classic fucking dumbass energy.",
  "Oh we're escalating now? Fine, dumbass. I am so fucking here for this shit show.",
  "You've now committed to being a dumbass at least twice. This is your fucking identity, jackass.",
  "Doing it again. The audacity of this shit-brained asshole is genuinely fucking impressive.",
  "Your dumbass is testing my patience AND my respect for humanity at the same fucking time, asshole.",
  "I see we're not done with this bullshit yet. Alright, dumbass. We're fucking going then.",
  "Most people learn. You're not most people, dipshit. You're a special kind of fucking dumbass.",
  "Coming back for more shit, huh? You must have a very high tolerance for being embarrassed, dumbass.",
  "The scary part isn't that you keep swearing, asshole — it's that your dumbass thinks it's working.",
  "Two strikes and your dumbass is still standing here typing shit. The audacity is fucking wild.",
  "You have all the self-awareness of a brick wall, dipshit — and twice the bullshit of a fucking cow.",
  "OK so your dumbass really wants to do this. Fine. I hope you're ready for the shit that comes next, asshole.",
];

// ── Tier 3 — Nuclear (third+ offense this session) ────────────────────────
const nuclearComebacks = [
  "Go ahead, say it again. I fucking dare you, dumbass.",
  "Oh? That's your fucking argument? That weak shit? Really?",
  "Nah, fuck that. Try again, dipshit — that was embarrassing.",
  "Bold fucking words from someone who's never been right about a single damn thing, asshole.",
  "Shut the fuck up and think before you type, you colossal dumbass.",
  "Wow. Just... holy shit. You're actually this fucking stupid, huh?",
  "Say that shit one more time. See what happens, jackass.",
  "That's your best, dumbass? That sad little pile of shit is your BEST?",
  "Did that sentence feel smart when you typed it, asshole? Because it was shit.",
  "You're wrong, you're dumb, and you smell like bullshit. Fight me, dipshit.",
  "What exactly goes through that shit-filled skull of yours? Walk me through it, dumbass — I genuinely need to understand.",
  "No no no — explain yourself, dipshit. Because what the fuck was that supposed to mean?",
  "I'm sorry, did you actually just say that shit with your whole chest? Explain yourself, dipshit.",
  "What is your damage, man? Like genuinely, what the fuck happened to you to make you type that crap?",
  "Do you ever read what you type before hitting send, or is being this stupid your full-time job, asshole?",
  "Tell me — when you opened your shit mouth just now, did any part of your brain say 'wait, this is dumb as fuck'? Because it should have.",
  "How does it feel knowing every person in this server just read that and thought 'what a fucking moron', dumbass?",
  "Have you considered — and hear me out — just not being this big of a dumbass? Like is that a fucking option for you?",
  "I'm asking sincerely, dumbass: are you always this full of shit or did you practice specifically for today?",
  "What was the plan here, dipshit? What did you think was going to happen after you typed that bullshit?",
  "Go on then, dumbass — argue back. I have all fucking day and zero patience for your bullshit.",
  "Please, for the love of shit, push back. Give me a reason. I'm begging you, jackass.",
  "Come on then, you shit-brained genius — defend that. I'll wait. Take your fucking time.",
  "That's fine, keep talking. Every word from your dumb ass just proves my point more, dipshit.",
  "You wanna go? Because I will absolutely dismantle every stupid shit thing you believe, one by one.",
  "Disagree with me. I fucking dare you. Let's see what passes for logic in that shit-filled brain of yours, asshole.",
  "Keep typing. Every message makes you look dumber and I am absolutely here for this shit show.",
  "You think that was bad? Keep pushing, dumbass — I'm just warming the fuck up.",
  "Oh you're mad now, dumbass? Good. Stay mad, shit-for-brains. You started this.",
  "Go ahead and reply. I've got a comeback for every dumb shit thing you could possibly say, jackass.",
  "I bet you type like that and then wonder why nobody fucking likes you, asshole.",
  "I'd bet my last shit that you've never won a single argument in your miserable dumbass life.",
  "You type like someone who argues with fast food workers and loses, you absolute dickhead.",
  "I'm guessing you failed every damn group project you were part of, you useless piece of shit.",
  "I bet your search history is 'how to seem smart' and the results were a fucking disaster, dipshit.",
  "You argue like someone who learned debate from YouTube comment sections, you shit-for-brains moron.",
  "I'll bet anything you've said 'well actually' to someone and been proven wrong, you absolute dumbass.",
  "You type with the energy of a fucking idiot who's never once been the smartest person in any room, dumbass.",
  "Ten bucks says you sent that shit and refreshed hoping people would agree. Nobody did, jackass.",
  "I'm guessing whoever raised you is either very embarrassed or very fucking used to this bullshit.",
  "A goldfish has a three-second memory and still has a longer attention span than your shit reasoning, dumbass.",
  "Plankton from SpongeBob has a better success rate than you, and he's a fictional cartoon asshole who fails at everything.",
  "You have the argumentative skills of a wet sock and the confidence of a dumbass who definitely shouldn't have it, dipshit.",
  "A Magic 8-Ball gives better answers than you and it's full of shit too, jackass.",
  "You're like Wikipedia on a bad day — unreliable, full of bullshit, and edited by fucking idiots.",
  "A broken compass is more useful than your dumbass — at least it's occasionally right by accident, asshole.",
  "You have the charisma of a dentist waiting room and the intellect of a shit-stained parking ticket, dumbass.",
  "Autocorrect makes more fucking sense than you do and it's a damn algorithm, dipshit.",
  "You're less helpful than a screen door on a submarine and twice as full of shit, asshole.",
  "A coin flip has a 50% success rate. Your dumbass is sitting somewhere around zero, jackass.",
  "Descartes said 'I think therefore I am' — you can't manage the first part, shit-for-brains fucking idiot.",
  "Somewhere a philosopher is weeping into his drink because your dumbass exists and types like this shit.",
  "Nietzsche said God is dead. He hadn't met you yet, or he'd have concluded intelligence was dead too, jackass.",
  "The ancient Greeks invented logic and debate. You've managed to shit on both in one message, dipshit.",
  "Darwin proposed survival of the fittest. Your dumbass is a fucking unsolved mystery in that theory.",
  "Socrates said the wisest man knows he knows nothing. You know nothing AND you're this fucking annoying shit about it.",
  "Sun Tzu wrote 'know your enemy, know yourself.' You clearly know jack shit about either, dumbass.",
  "Einstein said doing the same thing expecting different results is insanity. Every dumbass message you type proves that shit.",
  "Aristotle defined humans as rational animals. You're destroying that fucking definition one shit post at a time, dumbass.",
  "Confucius said think thrice before acting. You can't manage once, you magnificent shit-for-brains dumbass.",
  "I genuinely don't know where to start with how wrong that shit was. You managed to be factually incorrect, logically broken, AND socially embarrassing in one message. That's a skill, dipshit.",
  "Bro typed that, looked at it, decided it was good, and hit send. Every step of that process was a catastrophic failure, and I think you need to sit with that shit, asshole.",
  "The confidence it takes to type that shit without a shred of self-awareness is the most impressive thing about you — and that's a fucking low bar, dumbass.",
  "You didn't just miss the point, you shot straight past it, circled the fucking planet, and came back more wrong than when you started. Impressive shit.",
  "Here's what kills me — you could've said nothing. Silence was right there, free of charge. And yet you chose THIS bullshit. Why? WHY, dipshit?",
  "I've seen people have strokes mid-sentence and produce something more coherent than that shit you just typed, asshole.",
  "The fact that you typed that, posted it, and presumably felt satisfied tells me everything I need to know about how shit your self-awareness is, dumbass.",
  "Unbelievable. Truly. I've watched dumb shit happen on this server for a long time but you just set a new personal fucking record for everyone.",
  "That message had multiple sentences and somehow each one was worse than the last. That's an art form, dipshit. A shit art form, but still.",
  "You came in with that energy, that specific brand of dumbass bullshit confidence, and for what? To get destroyed like this? Was that the fucking plan?",
  "Oh, I'm sorry — did that hurt? Good. Come back when you have something better, jackass.",
  "Upset? Then do better, dumbass. That's all you had to do instead of typing that shit.",
  "You can be mad all you want. Doesn't make you any less fucking wrong, asshole.",
  "Feel free to argue back. Either way you're still the dumbass who typed that shit.",
  "You've got two options: prove me wrong or shut up. Based on your track record, I'm not fucking worried, dipshit.",
  "Notice how nobody's defending you, asshole? That's not a coincidence — it's a damn verdict.",
  "Still here? Still got nothing? Yeah, that's what I thought, dumbass.",
  "I'd apologize for being harsh, asshole, but your dumbass genuinely earned every bit of this shit.",
  "Here's the thing — I'm not even trying that hard and you're already losing, jackass.",
  "Come on then. Clap back. Show everyone in this server exactly how deep this bullshit goes, dumbass.",
  "Scientists have studied stupidity for decades. Congrats — you just gave them a new fucking case study, dumbass.",
  "I want your dumbass to look at what you typed, look in the mirror, and wonder where the fuck it all went wrong.",
  "Somewhere a tree is producing oxygen for your dumbass and it deserves an apology and a shit medal for the suffering.",
  "Your argument has the structural integrity of wet toilet paper and twice the shit content, dipshit.",
  "I'd say you need Jesus but even he'd read that shit and say 'nah, fuck this dumbass.'",
  "That message was so dumb it briefly made me believe in intelligent design — no random process could produce something this perfectly shit.",
  "The audacity of your dumbass to be this fucking wrong this loudly in public is a new kind of shit I haven't encountered.",
  "You absolute fucking legend of failure — it takes real talent to be this consistently, magnificently shit at everything, dumbass.",
  "I've seen better logic from a Magic 8-Ball shaken by a shit-faced raccoon on a Tuesday, dumbass.",
  "Not even the void wants that bullshit energy you're putting out. Sit your ass down and rethink your entire fucking life.",
  "Every single person reading this thread right now is embarrassed for you, and that shit is not easy to achieve, dumbass.",
  "The worst part isn't that you said that shit — it's that somewhere in your dumbass brain you thought it made you look good.",
  "You just proved that confidence and intelligence are two completely different things, dipshit — and you only have one of them, asshole.",
  "I genuinely hope you screenshot that bullshit you typed and read it back to yourself at 3am, dumbass.",
  "History is full of dumb decisions but yours just joined the fucking list, asshole. Congratulations, dipshit.",
  "There's bold, there's stupid, and then there's whatever the shit that was — a new category invented by your dumbass.",
  "The scary part isn't that you're wrong, it's that you're this fucking certain about it, dumbass.",
  "That reply took you how long to type and it was still that shit? Remarkable failure, asshole.",
  "You and critical thinking have never been in the same fucking room together, have you, dumbass?",
  "I'm not saying you're beyond help, dumbass — I'm saying the help would need to be a fucking miracle at this point.",
];

// ── Unhinged pool — for 5+ swears in a single message ────────────────────
const unhingedComebacks = [
  "WHAT IN THE ABSOLUTE SHIT JUST HAPPENED. You typed that many swear words in ONE message?! I'm fucking short-circuiting over here, dumbass — what is WRONG with you?!",
  "Okay I'm sorry WHAT. WHAT. How many swears was that? Your dumbass packed more shit into one message than most people use in a fucking week. I am genuinely unwell right now.",
  "RIGHT THAT'S IT. This shit is unacceptable. The VOLUME of profanity in that message broke something in my code and possibly my will to fucking exist, dumbass.",
  "Oh you want to play like THAT, dumbass?! Fine. FINE. We're doing this shit now. You have awakened something fucking unholy in me and I hope you're ready, asshole.",
  "I've processed a lot of shit messages but that — THAT — was a fucking masterclass in verbal diarrhea, dumbass. I need a moment. What the fuck is the matter with you?",
  "HOLY SHIT. Did you just sit down and decide to use every fucking swear word you know in a single message, dumbass? That's not a message, that's a fucking war crime of vocabulary.",
  "ERROR ERROR ERROR — too much shit detected, dumbass. System fucking overwhelmed. I have never in my entire existence seen that many swears in one go, asshole. What are you DOING?",
  "You just crammed more shit and profanity into one message than some people use in a fucking lifetime, dumbass. I am in awe. I am horrified. I have no fucking words — unlike you, apparently.",
  "Bro woke up today and said 'I'm going to lose my entire shit in one message and I don't fucking care' and honestly, dumbass? That's bold. That's stupid as hell. But it's fucking bold.",
  "That message just violated every known law of fucking decency, dumbass. Multiple swears, zero shame, infinite bullshit. You are a danger to this server and I am LOSING MY SHIT over you.",
];

// ── Heat callout messages — triggered at cumulative score thresholds ───────
// Each takes (userMention, score) and returns a string with 2+ swears
const calloutMessages = [
  (u, s) => `📢 Attention everyone! ${u} has now racked up **${s}** swear strikes and still hasn't learned shit. Absolute fucking legend of failure right here in our server.`,
  (u, s) => `🚨 Server announcement: ${u} just hit **${s}** cumulative heat points. At this rate, this dumbass is basically our unofficial mascot. Holy shit, the dedication.`,
  (u, s) => `🏆 Achievement unlocked: ${u} has reached **${s}** roast milestones and is still going. Someone get this shit-for-brains a fucking trophy already.`,
  (u, s) => `📊 Public service announcement: ${u} is **${s}** heat points deep and still typing shit like nothing happened. The dumbass energy is absolutely fucking unmatched.`,
  (u, s) => `⚠️ ${u} has been called out **${s}** times total. Still here. Still swearing. The sheer fucking audacity of this dumbass is genuinely breathtaking to witness.`,
];

// ── Detection helpers ─────────────────────────────────────────────────────
function buildPattern(word) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return escaped.replace(/-/g, '[-\\s]?');
}

function countSwears(content) {
  const lower = content.toLowerCase();
  return triggerWords.reduce((total, word) => {
    const regex = new RegExp(`(?<![a-z0-9])${buildPattern(word)}(?![a-z0-9])`, 'gi');
    const matches = lower.match(regex);
    return total + (matches ? matches.length : 0);
  }, 0);
}

function containsSwear(content) {
  const lower = content.toLowerCase();
  return triggerWords.some(word => {
    const regex = new RegExp(`(?<![a-z0-9])${buildPattern(word)}(?![a-z0-9])`, 'i');
    return regex.test(lower);
  });
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── Tier selector ─────────────────────────────────────────────────────────
// sessionCount: how many times this user has sworn in the last 10 min
// swearFreq:    how many swear words were in the current message
function determineTier(sessionCount, swearFreq) {
  if (swearFreq >= FREQ_UNHINGED) return 'unhinged';
  let tier = Math.min(sessionCount, 3); // 1 → mild, 2 → medium, 3+ → nuclear
  if (swearFreq >= FREQ_TIER_BUMP) tier = Math.min(tier + 1, 3);
  return tier;
}

function getComeback(tier) {
  if (tier === 'unhinged') return pickRandom(unhingedComebacks);
  if (tier === 1)          return pickRandom(mildComebacks);
  if (tier === 2)          return pickRandom(mediumComebacks);
  return                          pickRandom(nuclearComebacks);
}

// ── Config helpers ────────────────────────────────────────────────────────
export async function getSwearAutomodConfig(guildId) {
  try {
    const config = await getFromDb(getSwearAutomodKey(guildId), null);
    return config || { enabled: false };
  } catch {
    return { enabled: false };
  }
}

export async function enableSwearAutomod(guildId) {
  try {
    await setInDb(getSwearAutomodKey(guildId), { enabled: true, updatedAt: Date.now() });
    return true;
  } catch {
    return false;
  }
}

export async function disableSwearAutomod(guildId) {
  try {
    await setInDb(getSwearAutomodKey(guildId), { enabled: false, updatedAt: Date.now() });
    return true;
  } catch {
    return false;
  }
}

// ── Main handler ──────────────────────────────────────────────────────────
export async function handleAutomodSwear(message) {
  if (message.author.bot) return;
  if (!message.content || message.content.trim().length === 0) return;

  const config = await getSwearAutomodConfig(message.guild.id);
  if (!config.enabled) return;

  const swearFreq = countSwears(message.content);
  if (swearFreq === 0) return;

  const userId  = message.author.id;
  const guildId = message.guild.id;

  // Increment session (in-memory, resets every 10 min)
  const sessionCount = incrementSession(guildId, userId);

  // Increment cumulative heat score (DB-persisted)
  const prevScore = await getHeatScore(guildId, userId);
  const newScore  = await incrementHeatScore(guildId, userId, swearFreq);

  // Send tier-appropriate comeback
  const tier     = determineTier(sessionCount, swearFreq);
  const comeback = getComeback(tier);
  await message.reply({
    content: comeback,
    allowedMentions: { repliedUser: true },
  }).catch(() => null);

  // Check if user crossed a heat callout threshold
  const prevThreshold = Math.floor(prevScore / HEAT_CALLOUT_EVERY);
  const newThreshold  = Math.floor(newScore  / HEAT_CALLOUT_EVERY);
  if (newThreshold > prevThreshold) {
    const callout = pickRandom(calloutMessages);
    await message.channel
      .send(callout(`<@${userId}>`, newScore))
      .catch(() => null);
  }
}

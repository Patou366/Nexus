import { getFromDb, setInDb } from '../utils/database.js';

const getSwearAutomodKey = (guildId) => `guild:${guildId}:swear_automod`;

const triggerWords = [
  // Core classics
  'fuck', 'shit', 'bitch', 'ass', 'bastard', 'damn', 'crap', 'hell',
  'piss', 'dick', 'cunt', 'cock', 'asshole', 'motherfucker', 'bullshit',
  'jackass', 'dumbass', 'dipshit', 'fuckhead', 'shithead',

  // Fuck variants
  'fucker', 'fucked', 'fucking', 'fucks', 'fuckup', 'fuckoff', 'fuckboy',
  'fuckface', 'fucknut', 'fuckwit', 'clusterfuck', 'mindfuck', 'motherfucking',
  'abso-fucking-lutely', 'un-fucking-believable', 'godfuckingdamnit',
  'fuckstick', 'fuckass', 'fuckpig', 'fuckhead', 'fuckbucket',
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

  // Rat-bastard style compound swears
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

  // Leetspeak / bypass attempts (common substitutions)
  'f4ck', 'fück', 'sh1t', 'b1tch', 'a55', '@ss', 'a$$',
  'f**k', 's**t', 'b**ch', 'fu*k', 'sh*t',
];

const comebacks = [
  // ── SHORT DEVASTATORS ──
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

  // ── ARGUMENT BAIT — QUESTIONS ──
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

  // ── CHALLENGE / ESCALATION ──
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

  // ── PERSONAL ASSUMPTIONS ──
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

  // ── COMPARISON ROASTS ──
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

  // ── PHILOSOPHICAL BURNS ──
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

  // ── ELABORATE MULTI-SENTENCE ROASTS ──
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

  // ── ESCALATION / DOUBLING DOWN ──
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

  // ── WILD CARD / CREATIVE CHAOS ──
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

  // ── BONUS DESTROYERS ──
  "Every single person reading this thread right now is embarrassed for you, and that shit is not easy to achieve, dumbass.",
  "The worst part isn't that you said that shit — it's that somewhere in your dumbass brain you thought it made you look good.",
  "You just proved that confidence and intelligence are two completely different things, dipshit — and you only have one of them, asshole.",
  "I genuinely hope you screenshot that bullshit you typed and read it back to yourself at 3am, dumbass.",
  "History is full of dumb decisions but yours just joined the fucking list, asshole. Congratulations, dipshit.",
  "There's bold, there's stupid, and then there's whatever the shit that was — a new category invented by your dumbass.",
  "The scary part isn't that you're wrong, it's that you're this fucking certain about it, dumbass.",
  "That reply took you how long to type and it was still that shit? Remarkable failure, asshole.",
  "You and critical thinking have never been in the same fucking room together, have you, dumbass?",
  "I'm not saying you're beyond help, dumbass — I'm saying the help would need to be a fucking miracle at this point."
];

function containsSwear(content) {
  const lower = content.toLowerCase();
  return triggerWords.some(word => {
    // 1. Escape all regex special chars (except hyphens — handled next)
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // 2. Replace hyphens with an optional separator so that
    //    "son-of-a-bitch", "son of a bitch", and "sonofabitch" ALL match
    const pattern = escaped.replace(/-/g, '[-\\s]?');
    const regex = new RegExp(`(?<![a-z0-9])${pattern}(?![a-z0-9])`, 'i');
    return regex.test(lower);
  });
}

function getRandomComeback() {
  return comebacks[Math.floor(Math.random() * comebacks.length)];
}

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

export async function handleAutomodSwear(message) {
  if (message.author.bot) return;
  if (!message.content || message.content.trim().length === 0) return;

  const config = await getSwearAutomodConfig(message.guild.id);
  if (!config.enabled) return;

  if (!containsSwear(message.content)) return;

  await message.reply({
    content: getRandomComeback(),
    allowedMentions: { repliedUser: true }
  }).catch(() => null);
}

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

  // Shit variants
  'shitty', 'shitter', 'shitting', 'shitbag', 'shitstorm', 'shitstain',
  'shitshow', 'bullshitter', 'horseshit', 'apeshit', 'batshit', 'dogshit',
  'ratshit', 'chickenshit', 'pigshit', 'nutshit',

  // Ass variants
  'asses', 'asshat', 'asswipe', 'assclown', 'assbag', 'assface',
  'asshead', 'assmonger', 'ass-wipe', 'smartass', 'wiseass', 'hardass',
  'badass', 'halfass', 'lardass', 'fatass', 'lazass', 'tightass',
  'butthead', 'buttface', 'butthole', 'butt',

  // Dick variants
  'dicks', 'dickhead', 'dickface', 'dickwad', 'dickweed', 'dickbag',
  'dickmonger', 'dickbreath', 'limp-dick',

  // Cock variants
  'cocks', 'cockhead', 'cocksucker', 'cockwomble', 'cockup', 'cocknugget',

  // Bitch variants
  'bitchy', 'bitches', 'bitchin', 'son-of-a-bitch',

  // Cunt variants
  'cunts', 'cuntface', 'cuntbag',

  // British/international
  'wanker', 'tosser', 'twat', 'prick', 'arsehole', 'arse', 'bellend',
  'knobhead', 'knob', 'muppet', 'pillock', 'numpty', 'bollocks', 'bugger',
  'sod', 'blimey', 'chuffing', 'git', 'numbnuts', 'divvy',

  // Compound insults
  'douchebag', 'douche', 'scumbag', 'sleazebag', 'dirtbag', 'slimebag',
  'jagoff', 'jerkoff', 'jerk', 'jackoff', 'turd', 'turdburger', 'turdface',
  'nitwit', 'halfwit', 'dimwit', 'fuckwit', 'shitgibbon', 'twatwaffle',
  'pissbag', 'pissy', 'pissed', 'pisser', 'crybaby', 'moron', 'idiot',
  'imbecile', 'buffoon', 'nincompoop', 'dunce', 'schmuck', 'putz',
  'doofus', 'bozo', 'clodhopper', 'numskull', 'meathead', 'blockhead',

  // Slang & internet
  'wtf', 'stfu', 'gtfo', 'omfg', 'lmfao', 'af', 'bs',
  'deadass', 'hellhole', 'hellish', 'asshole',

  // Compound swears
  'son-of-a-bitch', 'piece-of-shit', 'shit-for-brains', 'ass-hat',
  'fuck-face', 'cock-up', 'shit-bag', 'piss-ant', 'rat-bastard',
  'clusterfuck', 'shitfuck', 'fuckshit',

  // Additional explicit
  'whore', 'slut', 'skank', 'tramp', 'sleaze', 'perv', 'creep',
  'loser', 'reject', 'degenerate', 'lowlife', 'scoundrel', 'vermin',
  'maggot', 'parasite', 'swine', 'pig', 'rat', 'snake', 'toad'
];

const comebacks = [
  "Oh damn, you kiss your mom with that filthy mouth? Impressive levels of bullshit stupidity.",
  "Bro typed that shit like it was gonna make you look cool. It didn't, dumbass.",
  "The audacity of this little shit thinking that crap was a good idea.",
  "What the fuck — congratulations, you've officially made everyone in this server dumber, asshole.",
  "Holy shit, did your brain fall out or were you always this fucking dumb?",
  "You absolute moron, even my error logs are smarter than your dumbass.",
  "Wow, what a fucking genius. Did you practice being this shit at everything?",
  "Jesus Christ, you couldn't think of anything better? Pathetic little shit-for-brains dipshit.",
  "The fact that you typed that crap and hit send says everything about you, dipshit.",
  "You're the fucking reason warning labels exist, you glorious dumbass.",
  "Bro woke up today and chose to embarrass themselves — respect the commitment, you absolute jackass.",
  "I've seen smarter shit come out of a broken toaster, holy fuck.",
  "You absolute fucking disaster of a human being. Sit your ass down.",
  "What in the actual fuck made you think that bullshit was acceptable?",
  "Your parents are somewhere cringing right now, you hopeless asshole.",
  "Damn, you really said that shit out loud. Brave and fucking stupid — what a combo.",
  "The sheer nerve of this little shit goblin typing that crap in here.",
  "Bro said that shit like it was a flex. You're embarrassing yourself, jackass.",
  "I'd roast you more but honestly your whole fucking existence is enough of a shit show.",
  "You're not edgy, you're just a dumbass idiot with a keyboard, you shit-brained genius.",
  "That shit was so dumb it gave me a headache. Thanks, asshole.",
  "Somewhere out there a village is missing its idiot — holy shit we found the bastard.",
  "The fact that your dumbass exists and typed that garbage is a double fucking tragedy.",
  "You're living proof that evolution goes in reverse sometimes, dipshit — it's a damn shame.",
  "Sir this is a Discord server, not your personal shit show for being a dumbass.",
  "I've met rocks with better damn judgment than you, holy shit.",
  "You could've said literally anything else but instead chose this bullshit. Bold, idiot.",
  "The audacity packed into that tiny shit-filled brain of yours is fucking fascinating.",
  "Congratu-fucking-lations, you played yourself, dumbass.",
  "I'm not saying you're an idiot, but you're absolutely a fucking idiot.",
  "You opened your dumbass mouth and deleted all doubts. Classic shit move.",
  "Wow, a whole shit message typed with zero fucking thoughts. Legendary garbage.",
  "Your IQ called — it wants a restraining order against your shit mouth, dumbass.",
  "That was genuinely the dumbest shit I've witnessed today, and I've seen a lot, asshole.",
  "You typed that crap faster than your brain could object. It had a point, dipshit.",
  "The confidence of a fucking idiot with absolutely nothing to back it up is remarkable shit.",
  "Peak human intellect right here, folks. What an absolute shit show of a dumbass.",
  "You make me want to uninstall reality, you magnificent dumbass shit stain.",
  "Bold fucking strategy being this stupid in public, dumbass. Let's see how that shit works out.",
  "Someone get this fucking idiot a dictionary and a damn timeout, holy shit.",
  "You're like a software bug — annoying, unnecessary, and dumb as shit, you absolute dickhead.",
  "That was impressively bad shit. Like, genuinely, take your dumbass and go touch grass.",
  "Oh wow, we got a real fucking comedian here. Sit your ass down.",
  "You're the human equivalent of a 404 error — nothing fucking useful found, dipshit.",
  "I'd explain why you're wrong but I don't have time for your shit, dumbass.",
  "Careful, your dumb shit is showing again. Tuck that bullshit in.",
  "You just set a new personal record for being the most useless piece of shit, you absolute jackass.",
  "The chat was way better before you opened your stupid shit mouth, jackass.",
  "Did you wake up and decide to donate your braincells to absolute fucking nothing, dumbass?",
  "Spectacular failure of a shit message. Frame it — it's the peak of your fucking career.",
  "Imagine waking up every damn day and choosing to be this much of a dumbass piece of shit.",
  "You're the living, breathing definition of why some shit species abandon their fucking young.",
  "Bro really said that shit like it was gonna land. Spoiler: it didn't, shit-for-brains asshole.",
  "I'd tell you to go touch grass but the grass doesn't deserve your dumbass shit either.",
  "Your braincell must be so damn lonely in that shit skull, rattling around by its fucking self.",
  "The amount of stupid shit packed into that message is genuinely fucking impressive.",
  "You absolute fucking walnut — do you practice being this insufferable shit or does it come naturally?",
  "I've seen better shit arguments from a drunk pigeon. Sit your dumbass down, genius.",
  "Plot twist: nobody asked, nobody gives a shit, and you're still a fucking dumbass.",
  "That message was so shit I need a moment of silence for my lost IQ points, asshole.",
  "You're not funny, you're not clever — you're just a piece of shit with a Discord account, dumbass.",
  "Bro is out here typing shit like their fingers have a vendetta against fucking intelligence.",
  "Congratulations on finding the keyboard, dipshit. Shame you couldn't find a damn brain cell.",
  "The WiFi that carried your shit message here deserves a fucking apology.",
  "Every time you type shit, some poor bastard somewhere loses a brain cell.",
  "You speak with the confidence of a fucking idiot who has never been right about anything, dumbass.",
  "I've seen potatoes with more damn self-awareness than you, jackass — and that's some sad shit.",
  "The internet was a fucking mistake and your dumbass is Exhibit A of that bullshit.",
  "Sir, your shit stupidity is not just showing — it's doing a full fucking runway walk.",
  "You came in swinging your shit around and somehow still missed everything, dumbass.",
  "I'm not mad, I'm just baffled that a dumbass like you gets to fuck up my day.",
  "Your message reads like shit that a golden retriever typed with its ass on the keyboard.",
  "The sheer commitment to being wrong about every fucking thing is some breathtaking bullshit.",
  "You'd lose a damn debate with a stop sign, holy shit — what a fucking mess you are.",
  "Not a single shit thought was had before typing that dumbass comment. Fucking incredible.",
  "You're the human equivalent of a paper cut — small, pointless, irritating as shit, and twice as fucking annoying.",
  "My guy typed that shit and felt fucking proud of it. That's the saddest damn part.",
  "If being a dumbass was a sport, you'd have a hall of fame trophy and a shit sponsorship deal.",
  "Somewhere a dunce cap is waiting for its rightful fucking owner. Go collect that shit.",
  "The bar was already underground and you still managed to limbo your shit self under it, dumbass.",
  "Bro fell out of the stupid shit tree and hit every fucking branch on the way down.",
  "You are the biological result of evolution taking a shit day and a fucking vacation.",
  "I don't know what's worse — the shit message or the fact that your dumbass thought it was good.",
  "You're like a participation trophy that no bastard wanted to give out — useless shit.",
  "Every shit word you type makes me more fucking grateful for the mute button, dumbass.",
  "Genuinely fucking astounding how you manage to be this shit at everything so consistently.",
  "Scientists study black holes because, like your dumbass, no useful shit ever comes out of them.",
  "You have the emotional intelligence of a wet shit napkin and the fucking mouth of a dumbass sailor.",
  "I'd say you're one in a million but that's still too many of your shit self, asshole.",
  "Typing that shit took more fucking effort than anything useful you've done all week, dumbass.",
  "Your self-awareness is so shit it needs a fucking submarine to find it, dumbass.",
  "That shit message is why some fucking species abandon their dumbass offspring.",
  "The unearned shit confidence in that message could power a fucking city, dumbass.",
  "You're the reason Discord has a block button, shit-for-brains. Use it on your dumbass self.",
  "Even a broken clock is right twice a day. You're just shit out of luck and fucking broken.",
  "Bro out here collecting Ls like they're limited edition shit — absolute fucking dumbass.",
  "I'd call you a clown but that would be an insult to clowns everywhere, you shit-stained asshole.",
  "You absolute fucking catastrophe. Who let your dumbass on the internet unsupervised?",
  "The audacity to type that shit without a single ounce of shame is genuinely fucking wild.",
  "History won't remember your dumbass, but this server will remember every shit thing you've typed."
];

function containsSwear(content) {
  const lower = content.toLowerCase();
  return triggerWords.some(word => {
    const escaped = word.replace(/[-]/g, '\\$&');
    const regex = new RegExp(`(?<![a-z])${escaped}(?![a-z])`, 'i');
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

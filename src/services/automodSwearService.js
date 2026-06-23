import { getFromDb, setInDb } from '../utils/database.js';

const getSwearAutomodKey = (guildId) => `guild:${guildId}:swear_automod`;

const triggerWords = [
  // Core classics
  'fuck', 'shit', 'bitch', 'ass', 'bastard', 'damn', 'crap', 'hell',
  'piss', 'dick', 'cunt', 'cock', 'asshole', 'motherfucker', 'bullshit',
  'jackass', 'dumbass', 'dipshit', 'fuckhead', 'shithead',
  // Compounds & variants
  'fucker', 'fucked', 'fucking', 'fucks', 'shitty', 'shitter', 'shitting',
  'bitchy', 'bitches', 'asses', 'asshat', 'asswipe', 'dicks', 'dickhead',
  'dickface', 'cocks', 'cockhead', 'cocksucker', 'cunts', 'motherfucking',
  // Mild but common
  'wtf', 'stfu', 'gtfo', 'bullcrap', 'horseshit', 'douchebag', 'douche',
  'prick', 'twat', 'wanker', 'tosser', 'arsehole', 'arse', 'bellend',
  // Extended slurs/insults
  'moron', 'idiot', 'retard', 'tard', 'numbnuts', 'knobhead', 'muppet',
  'fuckwit', 'nitwit', 'halfwit', 'dimwit', 'shitbag', 'scumbag',
  'sleazebag', 'dirtbag', 'douchebag', 'butthead', 'buttface', 'butthole',
  'crybaby', 'loser', 'deadass', 'hellhole', 'pissbag', 'pissy',
  'clusterfuck', 'mindfuck', 'godfuck', 'shitstorm', 'shitstain',
  'fuckboy', 'fuckface', 'fucknut', 'fuckup', 'fuckoff'
];

const comebacks = [
  // 1-50 (original)
  "Oh damn, you kiss your mom with that mouth? Impressive levels of stupidity.",
  "Bro typed that like it was gonna make you look cool. It didn't, dumbass.",
  "The audacity of this little shit thinking that was a good idea.",
  "Congratulations, you've officially made everyone in this server dumber.",
  "Holy shit, did your brain fall out or were you born this way?",
  "You absolute moron, even my error logs are smarter than you.",
  "Wow, what a fucking genius. Did you practice being this dumb?",
  "Jesus Christ, you couldn't think of anything better? Pathetic little shit.",
  "The fact that you typed that and hit send says everything about you, dipshit.",
  "You're the reason warning labels exist, you glorious dumbass.",
  "Bro woke up today and chose to embarrass themselves. Respect the commitment, idiot.",
  "I've seen smarter things come out of a broken toaster, holy shit.",
  "You absolute disaster of a human being. Sit down.",
  "What in the actual fuck made you think that was acceptable?",
  "Your parents are somewhere cringing right now, asshole.",
  "Damn, you really said that out loud. Brave and stupid — what a combo.",
  "The sheer nerve of this little goblin thinking they can talk like that.",
  "Bro said that like it was a flex. You're embarrassing yourself, jackass.",
  "I'd roast you more but my mom said I'm not allowed to burn trash.",
  "You're not edgy, you're just an idiot with a keyboard, genius.",
  "That message was so dumb it gave me a headache. Thanks, asshole.",
  "Somewhere out there, a village is missing its idiot. Found them.",
  "The fact that you exist and typed that is a double tragedy.",
  "You're proof that evolution sometimes goes in reverse, dipshit.",
  "Sir this is a Discord server, not your personal therapy session for being a dumbass.",
  "I've met rocks with better judgment than you, holy shit.",
  "You could've said literally anything else and yet you chose chaos. Bold, idiot.",
  "The audacity packed into that tiny little brain of yours is fascinating.",
  "Congratu-fucking-lations, you played yourself.",
  "I'm not saying you're stupid, but you're absolutely stupid.",
  "You opened your mouth and deleted all doubts. Classic dumbass move.",
  "Wow, a whole message typed with zero thoughts. Legendary garbage.",
  "Your IQ called — it wants to file a restraining order against your mouth.",
  "That was genuinely the dumbest thing I've witnessed today. And I've seen a lot.",
  "You typed that faster than your brain could object. It had a point, asshole.",
  "The confidence of someone with absolutely nothing to back it up. Remarkable.",
  "Peak human intellect right here, folks. Absolute shit show.",
  "You make me want to uninstall reality, you magnificent dumbass.",
  "Bold strategy, being this stupid in public. Let's see how it works out.",
  "Someone get this idiot a dictionary and a timeout.",
  "You're like a software bug — annoying, unnecessary, and hard to fix.",
  "That was impressively bad. Like, genuinely, go touch grass.",
  "Oh wow, we got a real comedian here. Sit your ass down.",
  "You're the human equivalent of a 404 error — nothing useful found.",
  "I'd explain why you're wrong but I don't have that kind of time or crayons.",
  "Careful, your dumb is showing again. Tuck that shit in.",
  "You just set a new personal record for being the most useless thing today.",
  "The chat was better before you opened your mouth, jackass.",
  "Did you just wake up and decide to donate your braincells to absolutely nothing?",
  "Spectacular failure of a message. Frame it — it's the peak of your career.",
  // 51-100 (new)
  "Imagine waking up and choosing to be this much of a dumbass. Every. Single. Day.",
  "You're the living, breathing definition of why some animals eat their young.",
  "Bro really said that like it was gonna land. Spoiler: it didn't, shit-for-brains.",
  "I'd tell you to go touch grass but the grass doesn't deserve that either.",
  "Your braincell must be so lonely in there. Just rattling around, all by itself.",
  "The amount of stupid packed into that message is genuinely impressive.",
  "You absolute walnut. Do you practice being this insufferable or does it come naturally?",
  "I've seen better arguments from a drunk pigeon. Sit down, genius.",
  "Plot twist: nobody asked, nobody cares, and you're still a dumbass.",
  "That message was so bad I need a moment of silence for my lost IQ points.",
  "You're not funny, you're not clever — you're just a headache with a Discord account.",
  "Bro is out here typing like their fingers have a personal vendetta against intelligence.",
  "Congratulations on finding the keyboard. Shame you couldn't find a single brain cell to go with it.",
  "The WiFi bringing your messages here deserves an apology.",
  "Every time you type, a librarian somewhere bursts into tears.",
  "You speak with the confidence of someone who has never been right about anything.",
  "I've seen potatoes with more self-awareness than you, jackass.",
  "The internet was a mistake and you are Exhibit A.",
  "Sir, your stupidity is not just showing — it's doing a full runway walk.",
  "You came in swinging and somehow still missed everything, dumbass.",
  "I'm not mad, I'm just genuinely baffled that you exist like this.",
  "Your message reads like someone let a golden retriever sit on the keyboard.",
  "The sheer commitment to being wrong at all times is honestly breathtaking.",
  "You'd lose a debate with a stop sign, holy shit.",
  "Not a single thought was had before typing that. Incredible.",
  "You're the human equivalent of a paper cut — small, pointless, and irritating as hell.",
  "My guy typed that and felt proud. That's the saddest part.",
  "If stupidity was a sport, you'd have a hall of fame trophy and a sponsorship deal.",
  "Somewhere a dunce cap is waiting for its rightful owner. Go collect it.",
  "The bar was already underground and you still managed to limbo under it.",
  "Bro fell out of the stupid tree and hit every branch on the way down.",
  "You are the biological result of evolution taking a personal day.",
  "I don't know what's worse — the message or the fact that you thought it was a good idea.",
  "You're like a participation trophy that no one wanted to give out.",
  "Every word you type makes me more grateful for the mute button.",
  "Genuinely astounding how you manage to be this wrong this consistently.",
  "Scientists study black holes because, like you, nothing useful comes out of them.",
  "You have the emotional intelligence of a wet napkin and the mouth of a sailor.",
  "I'd say you're one in a million but that's still too many of you.",
  "Typing that message took more effort than anything useful you've done all week.",
  "Your self-awareness is so low it needs a submarine to find it.",
  "That message is why some species abandon their offspring.",
  "The amount of unearned confidence in that message could power a small city.",
  "You're the reason Discord has a block button. Use it on yourself.",
  "Even a broken clock is right twice a day. You're just broken.",
  "Bro out here collecting Ls like they're limited edition.",
  "I'd call you a clown but that would be an insult to clowns everywhere.",
  "You absolute catastrophe. Who let you on the internet unsupervised?",
  "The audacity to type that without a single ounce of shame is genuinely wild.",
  "History will not remember you, but this server will remember the cringe."
];

function containsSwear(content) {
  const lower = content.toLowerCase();
  return triggerWords.some(word => {
    const regex = new RegExp(`\\b${word}\\b`, 'i');
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

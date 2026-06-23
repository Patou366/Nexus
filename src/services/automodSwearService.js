const triggerWords = [
  'fuck', 'shit', 'bitch', 'ass', 'bastard', 'damn', 'crap', 'hell',
  'piss', 'dick', 'cunt', 'cock', 'asshole', 'motherfucker', 'bullshit',
  'jackass', 'dumbass', 'dipshit', 'fuckhead', 'shithead'
];

const comebacks = [
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
  "Spectacular failure of a message. Frame it — it's the peak of your career."
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

export async function handleAutomodSwear(message) {
  if (message.author.bot) return;
  if (!message.content || message.content.trim().length === 0) return;

  if (!containsSwear(message.content)) return;

  const comeback = getRandomComeback();
  await message.reply({
    content: comeback,
    allowedMentions: { repliedUser: true }
  }).catch(() => null);
}

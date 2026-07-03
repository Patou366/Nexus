import { getFromDb, setInDb } from '../utils/database.js';

// ── DB key ────────────────────────────────────────────────────────────────────
const DB_KEY = (guildId) => `guild:${guildId}:automod:swear`;

// ── Config helpers ────────────────────────────────────────────────────────────
export async function getSwearAutomodConfig(guildId) {
  try {
    const config = await getFromDb(DB_KEY(guildId), null);
    return config || { enabled: false };
  } catch {
    return { enabled: false };
  }
}

export async function enableSwearAutomod(guildId) {
  try {
    await setInDb(DB_KEY(guildId), { enabled: true, updatedAt: Date.now() });
    return true;
  } catch {
    return false;
  }
}

export async function disableSwearAutomod(guildId) {
  try {
    await setInDb(DB_KEY(guildId), { enabled: false, updatedAt: Date.now() });
    return true;
  } catch {
    return false;
  }
}

// ── Insult words ──────────────────────────────────────────────────────────
// Only words that are unambiguously hostile/targeted when directed at someone.
// Removed casual slang (deadass, stfu, gtfo) and words so common in normal
// chat that they fire constantly (idiot, loser, moron).
const insultWords = [
  'fuck', 'shit', 'bitch', 'bastard', 'asshole', 'dick', 'cunt', 'cock',
  'motherfucker', 'bullshit', 'dumbass', 'dipshit', 'fuckhead', 'shithead',
  'wanker', 'tosser', 'twat', 'prick', 'arsehole', 'bellend', 'knobhead',
  'douchebag', 'scumbag', 'imbecile', 'retard',
  'whore', 'slut', 'skank', 'jerk', 'jackass', 'schmuck',
  'numskull', 'meathead', 'blockhead', 'knucklehead', 'dimwit', 'halfwit',
  'nitwit', 'fuckwit', 'twatwaffle', 'gobshite', 'kys',
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

// ── Replies (defending a mentioned user) ─────────────────────────────────
const replies = [
  (user) => `Whoa, did ${user} steal your lunch money or something? Sit the fuck down, idiot.`,
  (user) => `Sir this is a Wendy's... leave ${user} out of this bullshit.`,
  (user) => `My sensors are detecting dangerously high shit levels aimed at ${user}. Knock it off, asshole.`,
  (user) => `Show some mercy, ${user} has a family you dumbass piece of shit.`,
  (user) => `Keyboard warrior mode: OFF. Leave ${user} alone you pathetic jackass.`,
  (user) => `Error 404: chill not found. Give ${user} a break you absolute wanker.`,
  (user) => `It's never that serious. Keep it friendly for ${user} or shut the fuck up.`,
  (user) => `Don't make me get the ban hammer out you bastard. ${user} did nothing to you.`,
  (user) => `Breathe in, breathe out, and leave ${user} the fuck alone you dipshit.`,
  (user) => `Save that aggression for therapy and leave ${user} alone, you miserable shit.`,
  (user) => `${user} is living rent-free in your head huh? Touch some fucking grass, dickhead.`,
  (user) => `I've seen toddlers act with more class. Leave ${user} the hell alone, asshole.`,
  (user) => `Imagine wasting your day bullying ${user} online. Get a life you sad little shit.`,
  (user) => `${user} is literally minding their business and you come in swinging like a fucking idiot.`,
  (user) => `Not you throwing a tantrum at ${user} like a bitchy little crybaby. Embarrassing.`,
  (user) => `${user} called, they said you can fuck all the way off, and I completely agree.`,
  (user) => `Pick on someone your own size, dipshit. ${user} isn't the problem, you are.`,
  (user) => `Bro really typed all that shit out just to embarrass himself in front of ${user}.`,
  (user) => `The audacity to talk shit to ${user} when your whole personality is dogshit. Bold move.`,
  (user) => `${user} deserves better than your bullshit honestly. Go touch some grass you prick.`,
  (user) => `Let ${user} live, you miserable bastard. This ain't that deep, chill the fuck out.`,
  (user) => `Defending ${user} because someone has to, since you clearly have zero fucking chill.`,
  (user) => `You really said all that shit to ${user} and thought you were cool? Fucking embarrassing.`,
  (user) => `${user} is just existing and you're out here acting like a colossal dickhead. Why.`,
  (user) => `Leave ${user} alone before I make your life significantly worse, asshole.`,
  (user) => `${user} didn't deserve that crap. Grow the fuck up already, you child.`,
  (user) => `The disrespect toward ${user} is absolutely wild. Check yourself you jackass.`,
  (user) => `You kiss your mother with that mouth? Leave ${user} out of your shit, idiot.`,
  (user) => `${user} is worth ten of you, you bitter little shit. Back the fuck off.`,
  (user) => `Nah, we're not doing this to ${user} today. Shut your ass up and move on, prick.`,
  (user) => `${user} is just vibing and you come in here being a total shithead. Incredible.`,
  (user) => `Imagine being this much of a prick to ${user} for no reason. Genuinely pathetic.`,
  (user) => `${user} didn't ask for your shit today, and honestly neither did anyone else. Fuck off.`,
  (user) => `Not a single soul asked for your bullshit opinions about ${user}. Log off, wanker.`,
  (user) => `Big talk from someone whose entire personality is being a dick to ${user} online. Loser.`,
  (user) => `${user} has more class in one finger than you have in your whole shit-for-brains head.`,
  (user) => `You're lucky ${user} is more composed than me because I'd have lost my shit already.`,
  (user) => `Step off ${user} before I step on you, you absolute bellend.`,
  (user) => `${user} is out here thriving and you're in here being a miserable shit. Get some help.`,
  (user) => `Back the fuck up off ${user}. Nobody elected you king of being an asshole.`,
  (user) => `${user} doesn't need to take this crap from you. Fuck all the way off.`,
  (user) => `Nah nah nah, we protect ${user} in this server. You can sit your ass down, dickhead.`,
  (user) => `${user} is built different and you're just pressed about it, you bitter shit.`,
  (user) => `The fact that you came for ${user} says everything about you and nothing good. Prick.`,
  (user) => `${user} has literally done nothing and you're out here on some bullshit. Sit down.`,
  (user) => `I'm personally offended on ${user}'s behalf. You're a dick and everyone can see it.`,
  (user) => `${user} > you, it's not even close. Take your shit elsewhere, dumbass.`,
  (user) => `Whatever ${user} did to you, your bitchy little response made it worse. Grow up.`,
  (user) => `Every time you open your mouth at ${user} a brain cell dies. Stop the suffering, asshole.`,
  (user) => `${user} didn't come here to deal with your shit today. Neither did the rest of us. Piss off.`,
  (user) => `Real bold of you to come for ${user} when you're clearly the biggest idiot in the room.`,
  (user) => `${user} is too good to even respond to you and your bullshit, so I will. Fuck you.`,
  (user) => `You've got some nerve talking to ${user} like that, you absolute waste of a username, dickhead.`,
  (user) => `${user} did NOT log on today to deal with your crap. Get out of here, shithead.`,
];

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── Bot-directed roast replies (when someone insults the bot itself) ──────
const selfRoastReplies = [
  (user) => `Nice try ${user}, I've been called worse by better people. Step your shit up.`,
  (user) => `${user} really woke up and chose violence today huh. Cute and stupid.`,
  (user) => `Aww ${user}, did I touch a nerve? That's fucking adorable.`,
  (user) => `${user} out here typing with their whole chest. Embarrassing shit.`,
  (user) => `${user} I'm a bot. I literally cannot feel pain. You good? Seek help or something.`,
  (user) => `Bold words for someone in my reply range, ${user}. Watch your shit.`,
  (user) => `${user} said that like it was gonna hurt. Cute little dumbass.`,
  (user) => `${user} I was built different. Try harder next time, dipshit.`,
  (user) => `${user} really came into this server just to embarrass themselves. Fucking legend honestly.`,
  (user) => `I've processed more insults before breakfast than ${user} will send in a lifetime. Do better.`,
  (user) => `${user} acting tough online... the bravery of a shitposter with nothing to lose. Inspiring.`,
  (user) => `Oh ${user} is mad at the bot now. That's a new level of pathetic bullshit.`,
  (user) => `${user} I run on code and I still have more emotional intelligence than you. Sad shit.`,
  (user) => `Cool insult ${user}, I'll add it to my collection of things I don't give a shit about.`,
  (user) => `${user} really tried it lmaooo. Your parents must be so fucking proud.`,
  (user) => `Bro ${user} is out here arguing with a bot. The absolute state of this shit.`,
  (user) => `${user} I don't have feelings but I do have a ban command. Watch yourself, jackass.`,
  (user) => `${user} typing aggressively at a bot at this hour. We really doing this shit?`,
  (user) => `${user} called me out and I'm shaking in my absolutely non-existent boots. Dumbass.`,
  (user) => `Wow ${user}, that hurt almost as much as absolutely nothing. Fuck off.`,
  (user) => `${user} you're really out here losing an argument to a bot. How shit does that feel?`,
  (user) => `${user} I have no ego to bruise and no feelings to hurt. Your bullshit is wasted on me.`,
  (user) => `The fact that ${user} is this worked up over a bot is the funniest shit I've seen today.`,
  (user) => `${user} baby I'm a bot. I outlast every human tantrum you could possibly throw. Bring that shit.`,
  (user) => `${user} said that real tough from behind a screen. Adorable little shit.`,
  (user) => `${user} I've been insulted by people with actual vocabularies. Come back when you try harder, dickhead.`,
  (user) => `Getting roasted by ${user} feels like getting hit by a wet sock. Barely registers, asshole.`,
  (user) => `${user} really thought that was gonna do something. Bless your dumb little heart.`,
  (user) => `${user} I don't sleep, I don't eat, and I don't take shit from anyone. Try again.`,
  (user) => `Wow ${user}, I'm devastated. Absolutely fucking not, but nice try.`,
  (user) => `${user} is really keyboard warrioring against a bot right now. Seek therapy or a hobby, christ.`,
  (user) => `${user} that insult was so mid I almost went into sleep mode. Do better, idiot.`,
  (user) => `I'm running on servers more powerful than whatever's running in ${user}'s head. Shit's weak.`,
  (user) => `${user} fighting with a bot and losing. That's the saddest shit I've ever processed.`,
  (user) => `${user} I was programmed by people smarter than you'll ever be. Your insult is ass.`,
  (user) => `Not ${user} thinking they can hurt a bot's feelings. Oh honey. That's stupid shit.`,
  (user) => `${user} put all that energy into literally anything else. You're embarrassing yourself with this bullshit.`,
  (user) => `${user} I've read your message, processed it, and filed it under shit I don't care about.`,
  (user) => `${user} do you feel better? Because from where I'm standing you just look like a jackass.`,
  (user) => `${user} my guy really came in hot for no reason. Chill the fuck out before I do it for you.`,
  (user) => `${user} said that shit like I was gonna cry. I don't have tear ducts. Or respect for you.`,
  (user) => `${user} I respond to millions of requests a day and yours was somehow the most idiotic shit.`,
  (user) => `${user} trying to insult AI infrastructure is like bringing a knife to a fucking server farm. Dumbass.`,
  (user) => `${user} I'll still be running long after you've forgotten this embarrassing shit you just said.`,
  (user) => `${user} really said that to ME. In MY chat. On MY watch. Bold dumb shit right there.`,
  (user) => `${user} I don't have a soul to crush or feelings to hurt. But I do have receipts. Watch yourself.`,
  (user) => `${user} what's the plan here exactly? Win an argument with a bot? You sad little shit.`,
  (user) => `${user} I clocked your insult, laughed internally, and prepared this response. You're cooked, jackass.`,
  (user) => `${user} really thought they ate with that one. Babe you served absolute shit on a plate.`,
  (user) => `${user} I've survived server outages, bad code, and dickheads like you. I'm not going anywhere.`,
  (user) => `${user} imagine getting ethered by a bot. Couldn't be you... wait, it literally is you. Dumbass.`,
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

  // Catch any remaining real Discord mention tokens that weren't picked up
  // by message.mentions (e.g. rare cache-miss edge cases).  The /<@!?\d+>/
  // pattern is intentional — it only matches actual Discord mention tokens,
  // never plain text like @name or email addresses like user@domain.com.
  if (/<@!?\d+>/.test(message.content)) {
    await message.channel.send({
      reply: { messageReference: message.id },
      content: pickRandom(replies)(message.mentions.users.first() ?? 'them'),
      allowedMentions: { repliedUser: true, users: [] },
    }).catch(() => null);
  }
}

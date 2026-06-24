import { readFileSync, writeFileSync } from 'fs';

let content = readFileSync('src/services/automodSwearService.js', 'utf8');

// Fix 1: Replace the broken openQuestions array (apostrophes inside single quotes)
const brokenOpenQ = `const openQuestions = [
  'Prove me wrong. I\'ll wait.',
  'Name one time in your life you weren\'t the dumbest person in the room. Take your time.',
  'Go ahead and reply. Every message from you just adds more evidence.',
  'I genuinely want you to explain your thought process. Walk me through it. Slowly.',
  'What exactly was the plan here? Because I need to understand.',
  'Come on then — respond. Let\'s see how deep this rabbit hole goes.',
  'Tell me: do you think before you type, or is this all just instinct?',
  'Disagree with me. I\'m begging you. Give me something to work with.',
  'What would winning even look like for you right now? Genuinely curious.',
  'I\'d say sleep on it, but somehow I think tomorrow\'s version of you is just as bad.',
];`;

const fixedOpenQ = `const openQuestions = [
  "Prove me wrong. I'll wait.",
  "Name one time in your life you weren't the dumbest person in the room. Take your time.",
  "Go ahead and reply. Every message from you just adds more evidence.",
  "I genuinely want you to explain your thought process. Walk me through it. Slowly.",
  "What exactly was the plan here? Because I need to understand.",
  "Come on then — respond. Let's see how deep this rabbit hole goes.",
  "Tell me: do you think before you type, or is this all just instinct?",
  "Disagree with me. I'm begging you. Give me something to work with.",
  "What would winning even look like for you right now? Genuinely curious.",
  "I'd say sleep on it, but somehow I think tomorrow's version of you is just as bad.",
];`;

content = content.replace(brokenOpenQ, fixedOpenQ);

// Fix 2: Replace broken brutalDmMessages (apostrophes in single-quoted strings)
const brokenBrutal = `const brutalDmMessages = [
  'Hey. Just so you know — I went easy on you out there. What you actually deserved was this: you are genuinely one of the most embarrassing people I\'ve encountered in this server, and the fact that you keep coming back proves you haven\'t figured that out yet.',
  'This is the version I didn\'t post publicly: you are not funny, you are not edgy, and nobody in that channel thinks you\'re cool for swearing. They\'re cringing. Every. Single. Time.',
  'Privately? You\'re doing terribly. The public comeback was me being KIND. The truth is you\'ve been an absolute disaster in that channel and I don\'t think you\'re self-aware enough to realize it.',
  'I spared you the full roast out there. But between us: that was some of the weakest, most embarrassing behavior I\'ve logged in weeks. You should genuinely be ashamed.',
  'Don\'t tell anyone I said this, but the public reply was the polite version. The real answer is that whatever you think you\'re achieving by swearing in chat, it\'s not working. You look ridiculous.',
  'Just between you and me — I held back out there. You got a mild slap when you deserved a full demolition. Get it together before I stop being generous.',
  'Publicly I kept it civil. Privately: you are the chaos gremlin nobody asked for and everyone in that server has noticed. This isn\'t a good reputation to be building.',
  'Here\'s what I couldn\'t say in the channel: you are not the villain you think you are. You\'re more like the background NPC who keeps glitching. Fix it.',
];`;

const fixedBrutal = `const brutalDmMessages = [
  "Hey. Just so you know — I went easy on you out there. What you actually deserved was this: you are genuinely one of the most embarrassing people I've encountered in this server, and the fact that you keep coming back proves you haven't figured that out yet.",
  "This is the version I didn't post publicly: you are not funny, you are not edgy, and nobody in that channel thinks you're cool for swearing. They're cringing. Every. Single. Time.",
  "Privately? You're doing terribly. The public comeback was me being KIND. The truth is you've been an absolute disaster in that channel and I don't think you're self-aware enough to realize it.",
  "I spared you the full roast out there. But between us: that was some of the weakest, most embarrassing behavior I've logged in weeks. You should genuinely be ashamed.",
  "Don't tell anyone I said this, but the public reply was the polite version. The real answer is that whatever you think you're achieving by swearing in chat, it's not working. You look ridiculous.",
  "Just between you and me — I held back out there. You got a mild slap when you deserved a full demolition. Get it together before I stop being generous.",
  "Publicly I kept it civil. Privately: you are the chaos gremlin nobody asked for and everyone in that server has noticed. This isn't a good reputation to be building.",
  "Here's what I couldn't say in the channel: you are not the villain you think you are. You're more like the background NPC who keeps glitching. Fix it.",
];`;

content = content.replace(brokenBrutal, fixedBrutal);

// Fix 3: Replace the broken tamePublicMessages if they also have escape issues
const brokenTame = `const tamePublicMessages = [
  'Alright, noted. Moving on.',
  'Sure. That happened.',
  'Wow. Anyway.',
  'Bold choice. Carry on.',
  'Interesting. Very interesting.',
  'I see. Cool.',
  'Sure thing, champ.',
  'Right. Okay then.',
];`;

const fixedTame = `const tamePublicMessages = [
  "Alright, noted. Moving on.",
  "Sure. That happened.",
  "Wow. Anyway.",
  "Bold choice. Carry on.",
  "Interesting. Very interesting.",
  "I see. Cool.",
  "Sure thing, champ.",
  "Right. Okay then.",
];`;

content = content.replace(brokenTame, fixedTame);

// Fix 4: The mangled \n regex in the snippet line — fix the literal newline
content = content.replace(
  /const snippet = message\.content\.slice\(0, 80\)\.replace\(\/[\s\S]*?\/g, ' '\);/,
  "const snippet = message.content.slice(0, 80).replace(/\\n/g, ' ');"
);

writeFileSync('src/services/automodSwearService.js', content);
console.log('Syntax fixes applied. Running node --check...');

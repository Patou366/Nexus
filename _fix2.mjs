import { readFileSync, writeFileSync } from 'fs';
const lines = readFileSync('src/services/automodSwearService.js', 'utf8').split('\n');

const fixedBlock = [
`// ── Open Questions — appended to nuclear comebacks to bait a reply ─────────`,
`const openQuestions = [`,
`  "Prove me wrong. I'll wait.",`,
`  "Name one time in your life you weren't the dumbest person in the room. Take your time.",`,
`  "Go ahead and reply. Every message from you just adds more evidence.",`,
`  "I genuinely want you to explain your thought process. Walk me through it. Slowly.",`,
`  "What exactly was the plan here? Because I need to understand.",`,
`  "Come on then — respond. Let's see how deep this rabbit hole goes.",`,
`  "Tell me: do you think before you type, or is this all just instinct?",`,
`  "Disagree with me. I'm begging you. Give me something to work with.",`,
`  "What would winning even look like for you right now? Genuinely curious.",`,
`  "I'd say sleep on it, but somehow I think tomorrow's version of you is just as bad.",`,
`];`,
``,
`// ── Brutal DM pool — sent privately while public gets a tame response ──────`,
`const brutalDmMessages = [`,
`  "Hey. Just so you know — I went easy on you out there. What you actually deserved was this: you are genuinely one of the most embarrassing people I've encountered in this server, and the fact that you keep coming back proves you haven't figured that out yet.",`,
`  "This is the version I didn't post publicly: you are not funny, you are not edgy, and nobody in that channel thinks you're cool for swearing. They're cringing. Every. Single. Time.",`,
`  "Privately? You're doing terribly. The public comeback was me being KIND. The truth is you've been an absolute disaster in that channel and I don't think you're self-aware enough to realize it.",`,
`  "I spared you the full roast out there. But between us: that was some of the weakest, most embarrassing behavior I've logged in weeks. You should genuinely be ashamed.",`,
`  "Don't tell anyone I said this, but the public reply was the polite version. The real answer is that whatever you think you're achieving by swearing in chat, it's not working. You look ridiculous.",`,
`  "Just between you and me — I held back out there. You got a mild slap when you deserved a full demolition. Get it together before I stop being generous.",`,
`  "Publicly I kept it civil. Privately: you are the chaos gremlin nobody asked for and everyone in that server has noticed. This isn't a good reputation to be building.",`,
`  "Here's what I couldn't say in the channel: you are not the villain you think you are. You're more like the background NPC who keeps glitching. Fix it.",`,
`];`,
``,
`// ── Tame public responses — used when the real roast goes in the DM ───────`,
`const tamePublicMessages = [`,
`  "Alright, noted. Moving on.",`,
`  "Sure. That happened.",`,
`  "Wow. Anyway.",`,
`  "Bold choice. Carry on.",`,
`  "Interesting. Very interesting.",`,
`  "I see. Cool.",`,
`  "Sure thing, champ.",`,
`  "Right. Okay then.",`,
`];`,
];

// Find start line (0-indexed): line containing "Open Questions — appended"
const start = lines.findIndex(l => l.includes('Open Questions — appended to nuclear'));
// Find end line: closing ]; of tamePublicMessages (the ]; after "Right. Okay then.")
let end = start;
let closingCount = 0;
for (let i = start; i < lines.length; i++) {
  if (lines[i].trim() === '];') {
    closingCount++;
    if (closingCount === 3) { end = i; break; }
  }
}

console.log(`Replacing lines ${start} to ${end} (${end - start + 1} lines) with ${fixedBlock.length} lines`);
lines.splice(start, end - start + 1, ...fixedBlock);

// Also fix the broken snippet regex line (literal newline inside regex)
const snippetIdx = lines.findIndex(l => l.includes('const snippet = message.content.slice'));
if (snippetIdx !== -1) {
  lines[snippetIdx] = "  const snippet = message.content.slice(0, 80).replace(/\\n/g, ' ');";
  console.log(`Fixed snippet line at ${snippetIdx}`);
}

writeFileSync('src/services/automodSwearService.js', lines.join('\n'));
console.log('Written. Checking syntax...');

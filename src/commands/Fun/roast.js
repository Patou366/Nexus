import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';

const ROASTS = [
  (u) => `${u}, you are so damn stupid that you make me question whether evolution was actually a good idea. What the hell happened to you?`,
  (u) => `${u} your personality is so shit that even your reflection is embarrassed to look at you. Absolute disaster of a human being.`,
  (u) => `I've seen smarter decisions made by drunk idiots at 3am, and yet here you are ${u}, somehow worse than all of them combined. Pathetic as hell.`,
  (u) => `${u} if brains were gas you wouldn't have enough to power a damn toy car. Spectacularly useless, honestly.`,
  (u) => `The fact that ${u} wakes up every morning and chooses to be this annoying is genuinely impressive. Must take real damn effort to be this shit.`,
  (u) => `${u} you're the human equivalent of a wet sock. Cold, useless, and nobody wants to deal with your ass.`,
  (u) => `Scientists study black holes because nothing escapes them — kind of like how no good decision ever escapes ${u}'s brain. Absolutely dumb as hell fr.`,
  (u) => `${u} I've met parking tickets with more charm than you. At least the parking ticket knows what it's worth, which is more than your worthless self does.`,
  (u) => `If stupidity was a sport ${u} would be a damn Olympian. Gold medal, podium, anthem and everything. Congrats on being that shit.`,
  (u) => `${u} your opinion is about as useful as a screen door on a submarine. Nobody asked and nobody cares, so shut the hell up.`,
  (u) => `I genuinely feel bad for ${u}'s parents. Imagine working that hard to raise someone this damn disappointing. Rough as hell.`,
  (u) => `${u} you have the charisma of a soggy napkin and the intelligence of a broken calculator. A truly shit combination.`,
  (u) => `The trash takes itself out more successfully than ${u} has ever handled anything. Pathetically damn useless.`,
  (u) => `${u} is living proof that some people shouldn't be allowed near a keyboard. Every message you send makes the world a slightly worse place. Knock it off.`,
  (u) => `${u} I'd say you're a clown but that would insult clowns who actually have skills. You're just a damn mess with no act.`,
  (u) => `If ${u} were any more full of shit, farmers would queue up to use them as fertiliser. At least then you'd serve some damn purpose.`,
  (u) => `${u} you are the reason instructions exist on shampoo bottles. Dangerously and spectacularly dumb as hell.`,
  (u) => `I asked my dog what he thought of ${u} and he walked away. Even the damn dog has better taste and higher standards than to acknowledge you.`,
  (u) => `${u} your brain is so damn small that if it was a house, you'd still find a way to get lost in it. Unbelievably stupid.`,
  (u) => `The amount of effort ${u} puts into being useless is honestly mind-blowing. That kind of dedication to being this shit is almost impressive.`,
  (u) => `${u} if you were a spice you'd be flour. Bland, unnecessary, and honestly what the hell are you even doing here.`,
  (u) => `${u} is so full of himself that if he were any more self-absorbed, he'd collapse into a damn black hole of his own ego. Insufferable as hell.`,
  (u) => `I've seen better ideas come out of a damn fortune cookie than anything ${u} has ever produced in his entire existence. Genuinely awful.`,
  (u) => `${u} your sense of humour is so shit that even your jokes feel bad about themselves. An embarrassment to comedy everywhere.`,
  (u) => `The fact that ${u} is allowed to have opinions is a damn oversight on society's part. Every take you have is worse than the last. Stop.`,
  (u) => `${u} you have the emotional intelligence of a damn brick wall, except the wall has better posture and doesn't talk nonsense constantly.`,
  (u) => `If common sense was currency ${u} would be so damn broke he'd owe the bank an apology. Financially and intellectually bankrupt.`,
  (u) => `${u} I genuinely cannot tell if you're trying to be this annoying or if you're just naturally this damn awful at existing. Either way, yikes.`,
  (u) => `The audacity of ${u} showing up here every day like anybody asked for this bullshit is honestly kind of inspiring in the worst possible way.`,
  (u) => `${u} you are the human equivalent of a terms and conditions page. Nobody reads you, nobody wants to, and the world would be fine if you didn't exist.`,
  (u) => `I'd roast ${u} more but my therapist told me I need to stop wasting energy on people who are this damn hopeless. So this is a professional mercy.`,
  (u) => `${u} your vibe is so off that even your WiFi disconnects when you walk into the room. The damn technology is embarrassed by you.`,
  (u) => `If ${u} was a movie he'd be a straight-to-DVD disaster with a one-star rating and a plot that makes no damn sense. Avoid at all costs.`,
  (u) => `${u} the only thing bigger than your ego is how spectacularly wrong you are about everything. A truly shit combination of traits.`,
  (u) => `${u} you contribute about as much to this server as a broken mic in a recording studio. Useless, disruptive, and annoying as hell.`,
  (u) => `I asked ${u} for a good idea once and he damn near broke something trying to think. That's how rarely that process runs. Sad as hell.`,
  (u) => `${u} has the attention span of a goldfish and the wisdom of a damn doorknob. A genuinely tragic pairing.`,
  (u) => `If ${u} put as much effort into being a decent person as he puts into being this annoying, he might actually stop being this damn awful. Maybe.`,
  (u) => `${u} you are living proof that confidence and competence are completely different things and you somehow have neither. Impressive shit, honestly.`,
  (u) => `The worst part about ${u} is that he genuinely doesn't know how damn awful he is. That level of obliviousness is almost a superpower. Almost.`,
  (u) => `${u} if you were any more insufferable, scientists would have to classify you as a natural disaster. A genuine pain in the ass for everyone nearby.`,
  (u) => `I've had conversations with walls that were more damn engaging than anything ${u} has ever said. At least the wall doesn't talk back with nonsense.`,
  (u) => `${u} your presence in this server is like a damn fire alarm test — loud, annoying, pointless, and everyone wishes it would just stop already.`,
  (u) => `${u} you are genuinely the type of person that makes people appreciate the mute button. A damn gift to the block and ignore features.`,
  (u) => `If ${u} was a song he'd be the damn hold music that plays when customer service puts you on hold for two hours. Nobody chose this. Nobody wants it.`,
  (u) => `${u} the amount of hot air you produce should legally classify you as a climate threat. Dangerously full of useless shit at all times.`,
  (u) => `I don't know who hurt ${u} but they clearly didn't do enough of a job because you're still here being this insufferable. Damn shame.`,
  (u) => `${u} you have the self-awareness of a damn potato and the emotional range of a parking meter. Truly one of the humans ever created.`,
  (u) => `${u} is the reason people develop trust issues. One interaction with this disaster and suddenly therapy starts looking like a great damn investment.`,
  (u) => `If ${u}'s brain was an app it would crash constantly, drain the battery, and nobody would bother to download the update. Absolute shit software.`,
  (u) => `${u} you are so damn predictable that I could set my watch to your next bad take. Reliably wrong. Consistently awful. Impressive in a terrible way.`,
  (u) => `The fact that ${u} exists and still manages to contribute nothing is a damn achievement in itself. That kind of uselessness takes real talent.`,
  (u) => `${u} if life gave out awards for wasted potential you'd have a damn trophy room. Such an impressive collection of nothing accomplished.`,
  (u) => `${u} your fashion sense, personality, and intelligence all have one thing in common — they're all shit and getting worse over time.`,
  (u) => `I've seen better plans from people who were blindfolded and spinning than anything ${u} has ever come up with. Genuinely what the hell is wrong with you.`,
  (u) => `${u} you radiate the kind of energy that makes pets leave the room. Even animals can tell something is deeply wrong with your ass.`,
  (u) => `The only thing ${u} has ever successfully completed is being a damn disappointment, and even then I suspect there's room for improvement on that front.`,
  (u) => `${u} is so chronically online and still somehow this damn misinformed. That takes a special kind of effort. Genuinely awful research skills.`,
  (u) => `${u} you have the consistency of wet cement — slow, messy, and somehow everyone ends up stuck dealing with your bullshit anyway.`,
  (u) => `If ${u} had a dollar for every good decision he's made, he'd be completely damn broke and probably still confused about why. Hopeless.`,
  (u) => `${u} the audacity you carry around on a daily basis should come with a damn permit. Who gave you this level of unearned confidence? Revoke it immediately.`,
  (u) => `I want to say something nice about ${u} but that would require lying and I don't have the time or the damn energy for that today. Or any day.`,
  (u) => `${u} you are so damn argumentative that you'd fight with a mirror. Actually the mirror would probably win because at least it reflects reality.`,
  (u) => `If ${u} was a weather forecast he'd be 100% chance of bullshit with a high of being insufferable and no relief in damn sight.`,
  (u) => `${u} your takes are so cold and terrible that scientists want to study you to understand how someone can be so consistently this wrong. Awful as hell.`,
  (u) => `The only reason ${u} gets away with being this damn annoying is because nobody can be bothered to explain how exhausting he is. So here we are.`,
  (u) => `${u} you are the human equivalent of a software bug — unpredictable, frustrating, and everyone just wants you damn well patched out of existence.`,
  (u) => `${u} I've met garden gnomes with better conversation skills and more interesting personalities. At least the gnome isn't constantly full of shit.`,
  (u) => `If stupidity was painful ${u} would be in damn agony 24 hours a day and honestly that tracks. The universe would be balancing itself out.`,
  (u) => `${u} you're the type of person who makes group projects a living hell for everyone involved and still somehow takes credit for the damn results.`,
  (u) => `I genuinely cannot figure out how ${u} manages to be this wrong this consistently. It's almost like a damn skill. A terrible, useless skill.`,
  (u) => `${u} you'd lose an argument with a damn stop sign. The sign has one clear message and never contradicts itself, which already puts it ahead of you.`,
  (u) => `${u} your ego is writing cheques that your talent, personality, and intelligence absolutely cannot cash. A dangerously shit financial situation.`,
  (u) => `The kindest thing I can say about ${u} is that he's technically alive, which is about the only damn box he's managed to check successfully.`,
  (u) => `${u} you have the nerve of a damn tooth that needs pulling — constant pain, completely avoidable, and everyone wishes it would just go away already.`,
  (u) => `If ${u} was a book he'd be 400 pages of nothing with a misleading title and a shit ending. Zero stars. No redemption arc. Waste of paper.`,
  (u) => `${u} you are so damn unreliable that people have started treating your promises like weather forecasts — technically possible but probably wrong.`,
  (u) => `${u} somehow manages to make everyone around him dumber just by being nearby. That's a hell of a toxic superpower and it needs to be stopped.`,
  (u) => `The day ${u} has a good take will be the day I retire from damn everything, because at that point the world has clearly stopped making sense.`,
  (u) => `${u} you are the loudest, most annoying, least correct person in every conversation you enter and somehow you still think you're the shit. Wild.`,
  (u) => `I'd tell ${u} to go outside but I actually care about nature and I don't want to subject the environment to that level of bullshit and chaos.`,
  (u) => `${u} your confidence is inversely proportional to your ability. The less you can do the more damn sure you are that you're great. Remarkable delusion.`,
  (u) => `${u} you are single-handedly keeping the phrase "bless his heart" alive because nobody wants to say outright how utterly damn hopeless you are.`,
  (u) => `If ${u} put his brain on eBay, it wouldn't sell because nobody wants a damn item that's never been used and shows clear signs of neglect.`,
  (u) => `${u} you are genuinely the type of disaster that makes people nostalgic for problems they used to have. At least those made damn sense.`,
  (u) => `The most impressive thing ${u} has ever done is convince himself he's doing well. That's a hell of a magic trick with no damn basis in reality.`,
  (u) => `${u} you walk into every situation like you own the place and leave it worse than you found it, which is frankly a shit talent to have.`,
  (u) => `If ${u} was a tool he'd be a broken one that's also somehow dangerous to be near. Every damn project made worse by his involvement.`,
  (u) => `${u} the bar was already on the floor and you still found a way to trip over it. That's a damn skill I've never seen anyone else master so thoroughly.`,
  (u) => `I've tried to find something redeeming about ${u} and genuinely came up empty. This isn't a roast anymore, it's an honest-to-hell assessment.`,
  (u) => `${u} you are so damn bad at reading the room that you'd show up to a funeral and somehow make it about yourself. Absolutely no self-awareness.`,
  (u) => `${u} your whole vibe is like a damn error message — confusing, unwelcome, and everyone's first instinct is to close the window and pretend it didn't happen.`,
  (u) => `If ${u} was a smell, he'd be the specific kind of bad that makes you check your damn shoes and then check them again just to be sure.`,
  (u) => `${u} you have managed to lower expectations so thoroughly that people are now actively surprised when you don't screw something up. That's a hell of a legacy.`,
  (u) => `${u} is genuinely one of those people who could start an argument in an empty room and somehow come out of it wrong. Absolute shit instincts.`,
  (u) => `I've seen better survival instincts from people who genuinely don't know what they're doing than from ${u}, who apparently also doesn't but pretends otherwise. Damn.`,
  (u) => `${u} your whole personality is just recycled bad takes and borrowed confidence that you clearly can't afford. A spiritually broke and annoying ass person.`,
  (u) => `${u} if being wrong was an Olympic sport you'd have more golds than any athlete in history. A true damn champion of being consistently terrible.`,
  (u) => `The problem with ${u} is that he thinks he's the protagonist when he's clearly the warning story they tell so other people don't make the same damn mistakes.`,
];

function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

export default {
    data: new SlashCommandBuilder()
        .setName('roast')
        .setDescription('Roast a user with a savage line / Insultar a un usuario con una frase brutal')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('The user to roast / El usuario a insultar')
                .setRequired(true)
        ),

    async execute(interaction, guildConfig, client) {
        const target = interaction.options.getUser('user');
        const isSelf = target.id === interaction.user.id;

        const displayName = isSelf
            ? interaction.user.displayName || interaction.user.username
            : target.displayName || target.username;

        const roastLine = pickRandom(ROASTS)(displayName);

        const embed = createEmbed({
            title: isSelf
                ? '🔥 Roasting yourself? Respect. / ¿Insultándote a ti mismo? Respeto.'
                : `🔥 Roast: ${displayName}`,
            description: roastLine,
            color: 'error',
            footer: { text: `Requested by ${interaction.user.username}` },
            timestamp: true
        });

        await interaction.reply({ embeds: [embed] });

        logger.info(`Roast used by ${interaction.user.id} targeting ${target.id} in guild ${interaction.guild?.id}`);
    }
};

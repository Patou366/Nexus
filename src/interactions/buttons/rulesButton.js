import { EmbedBuilder, MessageFlags } from 'discord.js';
import { logger } from '../../utils/logger.js';

const RULES_EN = new EmbedBuilder()
    .setColor('#336699')
    .setTitle('📜 Official Server Rules')
    .setDescription(
        '**1. General Conduct & Respect**\n' +
        '• **Be Respectful:** Treat all members, moderators, players, coaches, and club personnel with respect. Constructive criticism of the team is fine; blind hatred is not.\n' +
        '• **Zero Tolerance for Hate Speech:** Any form of racism, homophobia, sexism, or discrimination will result in an immediate and permanent ban.\n' +
        '• **Keep Banter Civil (No Toxicity):** Football banter is part of the game, but personal attacks, severe toxicity, and harassment will not be tolerated. Know when to walk away from an argument.\n' +
        '• **No Brigading:** Do not troll, invade, or organize raids against other Discord servers or rival fanbases.\n\n' +

        '**2. Chat & Content Guidelines**\n' +
        '• **No NSFW or Shock Content:** Posting explicit, gory, or highly inappropriate content (text, images, or videos) will result in an instant ban.\n' +
        '• **Keep Channels on Topic:** Use the correct channels for your conversations. Please stick to English, Spanish and/or Catalan in #💬・chat.\n' +
        '• **No Spam or Tag Abuse:** Do not flood the chat with repeated messages, copypastas, or all-caps. Do not excessively tag specific roles, or individual members (including ghost-pinging).\n' +
        '• **No Illegal Streams or Gambling:** Do not share or ask for links to illegal sports streams, pirated content, or gambling/betting websites.\n\n' +

        '**3. Security & Self-Promotion**\n' +
        '• **No Advertising or Self-Promotion:** Do not post unauthorized Discord server invites, social media links, or personal projects without explicit permission from a Director or Owner.\n' +
        '• **No Scams or Malicious Links:** Posting phishing links, IP grabbers, or malicious software will result in an immediate ban. Protect your account; "I was hacked" is not a valid excuse.\n' +
        '• **No Impersonation:** Do not impersonate server staff, club personnel, or other members.\n' +
        '• **No Ban Evasion:** Creating alternate accounts to bypass a mute or ban will result in all associated accounts being permanently banned.\n\n' +

        '⚖️ **Moderation & Enforcement**\n' +
        '• **Staff Discretion:** The moderation team has the final say. If a staff member asks you to drop a topic or move on, please do so.\n' +
        '• **Use the Ticket System:** If you have an issue with a moderation action, spot a rule-breaker, or need help, open a ticket in #📩・support. **Do not argue with staff in public channels.**\n' +
        '• **Consequences:** Breaking these rules will result in a warning, timeout, kick, or ban, depending on the severity of the offense and your past history in the server.\n\n' +
        '*By participating in this server, you agree to abide by these rules.*',
    );

const RULES_ES = new EmbedBuilder()
    .setColor('#336699')
    .setTitle('📜 Normas oficiales del servidor')
    .setDescription(
        '**1. Conducta general y respeto**\n' +
        '• **Sé respetuoso:** Trata con respeto a todos los miembros, moderadores, jugadores, entrenadores y personal del club. Las críticas constructivas al equipo son aceptables; el odio ciego, no.\n' +
        '• **Tolerancia cero con el discurso de odio:** Cualquier forma de racismo, homofobia, sexismo o discriminación conllevará un baneo inmediato y permanente.\n' +
        '• **Mantén las bromas dentro de lo civilizado (sin toxicidad):** Las bromas futbolísticas son parte del juego, pero no se tolerarán ataques personales, toxicidad extrema ni acoso. Aprende cuándo retirarte de una discusión.\n' +
        '• **Prohibido el brigading:** No hagas trolling, invadas ni organices incursiones (raids) contra otros servidores de Discord o aficiones rivales.\n\n' +

        '**2. Normas de chat y contenido**\n' +
        '• **Sin contenido NSFW o impactante:** Publicar contenido explícito, sangriento o altamente inapropiado (texto, imágenes o vídeos) resultará en un baneo inmediato.\n' +
        '• **Mantén los canales en su temática:** Usa los canales adecuados para tus conversaciones. Por favor, utiliza inglés, español y/o catalán en #💬・chat.\n' +
        '• **Sin spam ni abuso de menciones:** No satures el chat con mensajes repetidos, copypastas ni texto en mayúsculas. No menciones excesivamente roles específicos ni a miembros individuales (incluyendo las menciones fantasma o ghost-pings).\n' +
        '• **Sin retransmisiones ilegales ni apuestas:** No compartas ni solicites enlaces a retransmisiones deportivas ilegales, contenido pirateado o sitios web de apuestas.\n\n' +

        '**3. Seguridad y autopromoción**\n' +
        '• **Sin publicidad ni autopromoción:** No publiques invitaciones a servidores de Discord no autorizados, enlaces a redes sociales o proyectos personales sin el permiso explícito de un director o del propietario.\n' +
        '• **Sin estafas ni enlaces maliciosos:** Publicar enlaces de phishing, rastreadores de IP o software malicioso conllevará un baneo inmediato. Protege tu cuenta; "me han hackeado" no es una excusa válida.\n' +
        '• **Prohibida la suplantación de identidad:** No te hagas pasar por miembros del equipo de moderación, personal del club u otros miembros.\n' +
        '• **Prohibido eludir sanciones:** Crear cuentas alternativas para saltarse un silencio (mute) o un baneo resultará en el baneo permanente de todas las cuentas asociadas.\n\n' +

        '⚖️ **Moderación y aplicación de normas**\n' +
        '• **Criterio del equipo:** La decisión final recae sobre el equipo de moderación. Si un miembro del equipo te pide que dejes un tema o pases a otra cosa, por favor hazlo.\n' +
        '• **Usa el sistema de tickets:** Si tienes algún problema con una acción de moderación, detectas a alguien que incumple las normas o necesitas ayuda, abre un ticket en #📩・support. **No discutas con el equipo en canales públicos.**\n' +
        '• **Consecuencias:** Infringir estas normas conllevará una advertencia, una suspensión temporal (timeout), una expulsión o un baneo, dependiendo de la gravedad de la infracción y de tu historial en el servidor.\n\n' +
        '*Al participar en este servidor, aceptas cumplir estas normas.*',
    );

export default {
    name: 'eb_rules',
    async execute(interaction, client, args) {
        // args[0] = 'en' or 'es'
        const lang = args[0];

        try {
            if (lang === 'en') {
                await interaction.reply({
                    embeds: [RULES_EN],
                    flags: MessageFlags.Ephemeral,
                });
            } else if (lang === 'es') {
                await interaction.reply({
                    embeds: [RULES_ES],
                    flags: MessageFlags.Ephemeral,
                });
            } else {
                await interaction.reply({
                    content: 'Unknown language button.',
                    flags: MessageFlags.Ephemeral,
                });
            }
        } catch (error) {
            logger.error('Error in rulesButton handler:', error);
            await interaction.reply({
                content: 'An error occurred while fetching the rules.',
                flags: MessageFlags.Ephemeral,
            }).catch(() => {});
        }
    },
};

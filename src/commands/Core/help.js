import {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} from "discord.js";
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { createEmbed } from "../../utils/embeds.js";
import {
    createSelectMenu,
} from "../../utils/components.js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CATEGORY_SELECT_ID = "help-category-select";
const ALL_COMMANDS_ID = "help-all-commands";
const BUG_REPORT_BUTTON_ID = "help-bug-report";
const HELP_MENU_TIMEOUT_MS = 5 * 60 * 1000;

const CATEGORY_ICONS = {
    Core: "ℹ️",
    Moderation: "🛡️",
    Economy: "💰",
    Fun: "🎮",
    Leveling: "📊",
    Utility: "🔧",
    Ticket: "🎫",
    Welcome: "👋",
    Giveaway: "🎉",
    Counter: "🔢",
    Tools: "🛠️",
    Search: "🔍",
    Reaction_Roles: "🎭",
    Community: "👥",
    Birthday: "🎂",
    Config: "⚙️",
};





export async function createInitialHelpMenu(client) {
    const commandsPath = path.join(__dirname, "../../commands");
    const categoryDirs = (
        await fs.readdir(commandsPath, { withFileTypes: true })
    )
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => dirent.name)
        .sort();

    const options = [
        {
            label: "📋 All Commands / Todos los Comandos",
            description: "View all available commands / Ver todos los comandos disponibles",
            value: ALL_COMMANDS_ID,
        },
        ...categoryDirs.map((category) => {
            const categoryName =
                category.charAt(0).toUpperCase() +
                category.slice(1).toLowerCase();
            const icon = CATEGORY_ICONS[categoryName] || "🔍";
            return {
                label: `${icon} ${categoryName}`,
                description: `View commands in the ${categoryName} category / Ver comandos en la categoria ${categoryName}`,
                value: category,
            };
        }),
    ];

    const botName = client?.user?.username || "Bot";
    const embed = createEmbed({
        title: `🤖 ${botName} Help Center / Centro de Ayuda`,
        description: "Your all-in-one Discord companion for moderation, economy, fun, and server management. / Tu companero todo en uno de Discord para moderacion, economia, diversion y gestion del servidor.",
        color: 'primary'
    });

    embed.addFields(
        {
            name: "🛡️ **Moderation / Moderacion**",
            value: "Server moderation, user management, and enforcement tools / Moderacion del servidor, gestion de usuarios y herramientas de aplicacion",
            inline: true
        },
        {
            name: "🎮 **Fun / Diversion**",
            value: "Games, entertainment, and interactive commands / Juegos, entretenimiento y comandos interactivos",
            inline: true
        },
        {
            name: "📊 **Leveling / Niveles**",
            value: "User levels, XP system, and progression tracking / Niveles de usuario, sistema XP y seguimiento de progreso",
            inline: true
        },
        {
            name: "🎫 **Tickets**",
            value: "Support ticket system for server management / Sistema de tickets de soporte para gestion del servidor",
            inline: true
        },
        {
            name: "🎉 **Giveaways / Sorteos**",
            value: "Automated giveaway management and distribution / Gestion automatica de sorteos y distribucion",
            inline: true
        },
        {
            name: "👋 **Welcome / Bienvenida**",
            value: "Member welcome messages and onboarding / Mensajes de bienvenida y orientacion de miembros",
            inline: true
        },
        {
            name: "🎂 **Birthdays / Cumpleanos**",
            value: "Birthday tracking and celebration features / Seguimiento de cumpleanos y funciones de celebracion",
            inline: true
        },
        {
            name: "👥 **Community / Comunidad**",
            value: "Community tools, applications, and member engagement / Herramientas comunitarias, aplicaciones y participacion de miembros",
            inline: true
        },
        {
            name: "⚙️ **Config / Configuracion**",
            value: "Server and bot configuration management commands / Comandos de gestion de configuracion del servidor y bot",
            inline: true
        },
        {
            name: "🔢 **Counter / Contador**",
            value: "Live counter channel setup and counter controls / Configuracion de canal contador en vivo y controles",
            inline: true
        },
        {
            name: "🎙️ **Join to Create / Unirse para Crear**",
            value: "Dynamic voice channel creation and management / Creacion y gestion dinamica de canales de voz",
            inline: true
        },
        {
            name: "🎭 **Reaction Roles / Roles de Reaccion**",
            value: "Self-assignable roles using reaction-role systems / Roles autoasignables usando sistemas de reaccion",
            inline: true
        },
        {
            name: "✅ **Verification / Verificacion**",
            value: "Member verification workflows and access gating / Flujos de verificacion de miembros y control de acceso",
            inline: true
        },
        {
            name: "🔧 **Utilities / Utilidades**",
            value: "Useful tools and server utilities / Herramientas utiles y utilidades del servidor",
            inline: true
        }
    );

    embed.setFooter({
        text: "Made with ❤️ / Hecho con ❤️"
    });
    embed.setTimestamp();

    const bugReportButton = new ButtonBuilder()
        .setCustomId(BUG_REPORT_BUTTON_ID)
        .setLabel("Report Bug / Reportar Error")
        .setStyle(ButtonStyle.Danger);

    const supportButton = new ButtonBuilder()
        .setLabel("Support Server / Servidor de Soporte")
        .setURL("https://discord.gg/YCkwJk4HaC")
        .setStyle(ButtonStyle.Link);

    const selectRow = createSelectMenu(
        CATEGORY_SELECT_ID,
        "Select to view commands / Selecciona para ver comandos",
        options,
    );

    const buttonRow = new ActionRowBuilder().addComponents([
        bugReportButton,
        supportButton,
    ]);

    return {
        embeds: [embed],
        components: [buttonRow, selectRow],
    };
}

export default {
    data: new SlashCommandBuilder()
        .setName("help")
        .setDescription("Displays the help menu with all available commands"),

    async execute(interaction, guildConfig, client) {
        
        const { MessageFlags } = await import('discord.js');
        await InteractionHelper.safeDefer(interaction);
        
        const { embeds, components } = await createInitialHelpMenu(client);

        await InteractionHelper.safeEditReply(interaction, {
            embeds,
            components,
        });

        setTimeout(async () => {
            try {
                const closedEmbed = createEmbed({
                    title: "Help menu closed / Menu de ayuda cerrado",
                    description: "Help menu has been closed, use /help again. / El menu de ayuda ha sido cerrado, usa /help de nuevo.",
                    color: "secondary",
                });

                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [closedEmbed],
                    components: [],
                });
            } catch (error) {

            }
        }, HELP_MENU_TIMEOUT_MS);
    },
};



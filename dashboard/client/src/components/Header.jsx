import { useLocation } from 'react-router-dom'
import GuildSelector from './GuildSelector.jsx'

const titles = {
  '/':              { title: 'General Settings',   desc: 'Prefix, bot status, accent color, and core role assignments' },
  '/logging':       { title: 'Logging',            desc: 'Configure which events are logged and where' },
  '/leveling':      { title: 'Leveling & XP',      desc: 'XP rates, cooldowns, level-up messages, and role rewards' },
  '/tickets':       { title: 'Tickets',            desc: 'Ticket categories, logging, and lifecycle settings' },
  '/verification':  { title: 'Verification',       desc: 'Member verification channel, roles, and auto-verify rules' },
  '/welcome':       { title: 'Welcome & Goodbye',  desc: 'Welcome and goodbye messages, embeds, and autoroles' },
  '/moderation':    { title: 'Moderation',         desc: 'Automod toggles, modlog events, and ignored targets' },
  '/commands':      { title: 'Command Toggles',    desc: 'Enable or disable individual bot commands globally' },
  '/applications':  { title: 'Applications',       desc: 'Application channel, questions, reviewer roles, and cooldowns' },
  '/join-to-create':{ title: 'Join To Create',     desc: 'Auto voice channel creation triggers and name templates' },
  '/raid-shield':   { title: 'Raid Shield',        desc: 'Anti-raid detection, quarantine roles, and AI moderation' },
}

export default function Header() {
  const { pathname } = useLocation()
  const info = titles[pathname] || { title: 'Settings', desc: '' }

  return (
    <div className="flex items-center justify-between px-8 py-5 border-b border-[#1e2130] bg-[#0f1117]">
      <div>
        <h1 className="text-white text-xl font-semibold">{info.title}</h1>
        <p className="text-gray-500 text-sm mt-0.5">{info.desc}</p>
      </div>
      <GuildSelector />
    </div>
  )
}

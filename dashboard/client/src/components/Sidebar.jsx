import { NavLink } from 'react-router-dom'

const nav = [
  { to: '/',              label: 'General',       icon: '⚙️' },
  { to: '/logging',       label: 'Logging',       icon: '📋' },
  { to: '/leveling',      label: 'Leveling',      icon: '⭐' },
  { to: '/tickets',       label: 'Tickets',       icon: '🎫' },
  { to: '/verification',  label: 'Verification',  icon: '✅' },
  { to: '/welcome',       label: 'Welcome',       icon: '👋' },
  { to: '/moderation',    label: 'Moderation',    icon: '🛡️' },
  { to: '/commands',      label: 'Commands',      icon: '🔧' },
  { to: '/applications',  label: 'Applications',  icon: '📝' },
  { to: '/join-to-create',label: 'Join To Create',icon: '🔊' },
  { to: '/raid-shield',   label: 'Raid Shield',   icon: '🚨' },
]

export default function Sidebar() {
  return (
    <aside className="w-60 min-h-screen bg-[#12141c] border-r border-[#1e2130] flex flex-col shrink-0">
      <div className="px-5 py-6 border-b border-[#1e2130]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-brand-600 flex items-center justify-center text-lg">⚡</div>
          <div>
            <p className="text-white font-semibold text-sm leading-tight">TitanBot</p>
            <p className="text-gray-500 text-xs">Dashboard</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        <p className="text-gray-600 text-[10px] font-semibold uppercase tracking-wider px-3 pb-2">Configuration</p>
        {nav.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-brand-600/20 text-brand-400 font-medium'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
              }`
            }
          >
            <span className="text-base leading-none">{icon}</span>
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="px-5 py-4 border-t border-[#1e2130]">
        <p className="text-gray-600 text-xs">v1.1.1 · Nexus Custom Bot</p>
      </div>
    </aside>
  )
}

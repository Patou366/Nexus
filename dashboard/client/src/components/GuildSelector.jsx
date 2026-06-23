import { useGuild } from '../context/GuildContext.jsx'

export default function GuildSelector() {
  const { guilds, selectedGuildId, setSelectedGuildId, loading, error } = useGuild()

  if (loading) return (
    <div className="h-8 w-48 bg-[#1e2130] rounded-lg animate-pulse" />
  )

  if (error) return (
    <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-1.5 max-w-xs">
      <span>⚠️</span>
      <span className="truncate" title={error}>DB unavailable — set POSTGRES_URL</span>
    </div>
  )

  if (!guilds.length) return (
    <div className="text-xs text-gray-500 bg-[#1e2130] border border-[#2a2d3e] rounded-lg px-3 py-1.5">
      No servers in database yet
    </div>
  )

  return (
    <select
      value={selectedGuildId || ''}
      onChange={e => setSelectedGuildId(e.target.value)}
      className="bg-[#1e2130] text-gray-200 text-sm border border-[#2a2d3e] rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent cursor-pointer"
    >
      {guilds.map(g => (
        <option key={g.id} value={g.id}>
          Server ID: {g.id}
        </option>
      ))}
    </select>
  )
}

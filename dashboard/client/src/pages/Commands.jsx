import { useState, useEffect } from 'react'
import { useGuild } from '../context/GuildContext.jsx'
import { SectionCard, Toggle, SaveButton } from '../components/SectionCard.jsx'

const COMMAND_LIST = [
  { category: 'Moderation', commands: ['ban', 'kick', 'mute', 'unmute', 'warn', 'warnings', 'clearwarnings', 'timeout', 'untimeout', 'purge', 'lock', 'unlock', 'slowmode', 'nick', 'role'] },
  { category: 'Fun', commands: ['8ball', 'coinflip', 'dice', 'joke', 'meme', 'gif', 'ship', 'rps', 'trivia', 'poll'] },
  { category: 'Utility', commands: ['help', 'ping', 'serverinfo', 'userinfo', 'avatar', 'invite', 'uptime', 'stats', 'afk', 'remind', 'translate'] },
  { category: 'Leveling', commands: ['rank', 'leaderboard', 'xp', 'setxp', 'resetxp'] },
  { category: 'Tickets', commands: ['newticket', 'closeticket', 'adduser', 'removeuser', 'renameticket'] },
  { category: 'Giveaways', commands: ['gcreate', 'gend', 'greroll', 'gdelete', 'glist'] },
  { category: 'Applications', commands: ['apply', 'application', 'accept', 'deny', 'applications'] },
  { category: 'Birthday', commands: ['birthday', 'setbirthday', 'deletebirthday', 'birthdays'] },
  { category: 'Music', commands: ['play', 'stop', 'skip', 'queue', 'nowplaying', 'pause', 'resume', 'volume'] },
]

export default function Commands() {
  const { fetchSection, saveSection, selectedGuildId } = useGuild()
  const [enabled, setEnabled] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!selectedGuildId) return
    setLoading(true)
    fetchSection('config')
      .then(cfg => setEnabled(cfg.enabledCommands || {}))
      .catch(console.error)
      .finally(() => setLoading(false))
    setSaved(false)
  }, [selectedGuildId])

  function toggle(cmd, value) {
    setEnabled(e => ({ ...e, [cmd]: value }))
    setSaved(false)
  }

  function toggleAll(commands, value) {
    const patch = {}
    commands.forEach(c => (patch[c] = value))
    setEnabled(e => ({ ...e, ...patch }))
    setSaved(false)
  }

  async function handleSave() {
    setSaving(true)
    try {
      await saveSection('config', { enabledCommands: enabled })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e) {
      alert('Save failed: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  if (!selectedGuildId) return <div className="text-gray-500 text-sm">No server selected.</div>
  if (loading) return <Skeleton />

  const q = search.toLowerCase()

  return (
    <div className="max-w-2xl">
      <div className="mb-5">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search commands…"
          className="w-full bg-[#1a1d27] border border-[#2a2d3e] text-gray-200 text-sm rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-500 placeholder-gray-600"
        />
      </div>

      {COMMAND_LIST.filter(g => !q || g.commands.some(c => c.includes(q))).map(({ category, commands }) => {
        const filtered = q ? commands.filter(c => c.includes(q)) : commands
        const allOn = filtered.every(c => enabled[c] !== false)
        return (
          <SectionCard key={category} title={category}>
            <div className="flex items-center justify-between mb-3 -mt-2">
              <span className="text-gray-500 text-xs">{filtered.length} command{filtered.length !== 1 ? 's' : ''}</span>
              <button
                onClick={() => toggleAll(filtered, !allOn)}
                className="text-xs text-brand-400 hover:text-brand-300 font-medium"
              >
                {allOn ? 'Disable all' : 'Enable all'}
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {filtered.map(cmd => (
                <div key={cmd} className="flex items-center justify-between bg-[#0f1117] rounded-lg px-3 py-2">
                  <code className="text-gray-300 text-sm font-mono">/{cmd}</code>
                  <Toggle
                    value={enabled[cmd] !== false}
                    onChange={v => toggle(cmd, v)}
                  />
                </div>
              ))}
            </div>
          </SectionCard>
        )
      })}

      <div className="flex justify-end mt-2">
        <SaveButton onClick={handleSave} saving={saving} saved={saved} />
      </div>
    </div>
  )
}

function Skeleton() {
  return <div className="max-w-2xl space-y-4 animate-pulse">{[1,2,3].map(i => <div key={i} className="bg-[#1a1d27] border border-[#1e2130] rounded-xl h-48" />)}</div>
}

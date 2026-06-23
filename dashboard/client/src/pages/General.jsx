import { useState, useEffect } from 'react'
import { useGuild } from '../context/GuildContext.jsx'
import { SectionCard, Field, TextInput, SelectInput, SaveButton } from '../components/SectionCard.jsx'

const STATUS_OPTIONS = [
  { value: 'online',    label: '🟢 Online' },
  { value: 'idle',      label: '🟡 Idle' },
  { value: 'dnd',       label: '🔴 Do Not Disturb' },
  { value: 'invisible', label: '⚫ Invisible' },
]

export default function General() {
  const { fetchSection, saveSection, selectedGuildId } = useGuild()
  const [cfg, setCfg] = useState({})
  const [botStatus, setBotStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!selectedGuildId) return
    setLoading(true)
    Promise.all([
      fetchSection('config'),
      fetch('/api/guilds/global/status').then(r => r.json()).catch(() => ({}))
    ])
      .then(([config, globalStatus]) => {
        setCfg(config)
        if (globalStatus.status) setBotStatus(globalStatus.status)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
    setSaved(false)
  }, [selectedGuildId])

  function set(key, value) {
    setCfg(c => ({ ...c, [key]: value }))
    setSaved(false)
  }

  async function handleSave() {
    setSaving(true)
    try {
      // Save guild-level config (prefix, roles, channels, etc.)
      await saveSection('config', {
        prefix: cfg.prefix,
        accentColor: cfg.accentColor,
        modRole: cfg.modRole,
        adminRole: cfg.adminRole,
        premiumRoleId: cfg.premiumRoleId,
        autoRole: cfg.autoRole,
        birthdayChannelId: cfg.birthdayChannelId,
        reportChannelId: cfg.reportChannelId,
      })
      // Save bot status globally (it's not per-guild)
      if (botStatus) {
        const r = await fetch('/api/guilds/global/status', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: botStatus }),
        })
        if (!r.ok) throw new Error('Failed to save bot status')
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e) {
      alert('Save failed: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  if (!selectedGuildId) return <NoGuild />
  if (loading) return <Skeleton />

  return (
    <div className="max-w-2xl">
      <SectionCard title="Bot Behaviour" description="Core command prefix and status.">
        <Field label="Command Prefix" hint="Character(s) used before commands (e.g. !)">
          <TextInput value={cfg.prefix} onChange={v => set('prefix', v)} placeholder="!" />
        </Field>
        <Field label="Bot Status" hint="Presence shown in the member list">
          <SelectInput value={botStatus} onChange={v => { setBotStatus(v); setSaved(false) }} options={STATUS_OPTIONS} placeholder="Select status…" />
        </Field>
        <Field label="Accent Color" hint="Hex color used in bot embeds">
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={cfg.accentColor || '#7c6cf0'}
              onChange={e => set('accentColor', e.target.value)}
              className="w-10 h-9 rounded cursor-pointer border-0 bg-transparent"
            />
            <TextInput value={cfg.accentColor} onChange={v => set('accentColor', v)} placeholder="#7c6cf0" />
          </div>
        </Field>
      </SectionCard>

      <SectionCard title="Roles" description="Key role IDs that grant elevated bot permissions.">
        <Field label="Mod Role ID" hint="Role ID with moderator access">
          <TextInput value={cfg.modRole} onChange={v => set('modRole', v)} placeholder="Role ID…" />
        </Field>
        <Field label="Admin Role ID" hint="Role ID with admin access">
          <TextInput value={cfg.adminRole} onChange={v => set('adminRole', v)} placeholder="Role ID…" />
        </Field>
        <Field label="Premium Role ID" hint="Role ID for premium members">
          <TextInput value={cfg.premiumRoleId} onChange={v => set('premiumRoleId', v)} placeholder="Role ID…" />
        </Field>
        <Field label="Auto-assign Role ID" hint="Role given automatically when a member joins">
          <TextInput value={cfg.autoRole} onChange={v => set('autoRole', v)} placeholder="Role ID…" />
        </Field>
      </SectionCard>

      <SectionCard title="Channels" description="Channel IDs for specific bot functions.">
        <Field label="Birthday Channel ID" hint="Where birthday announcements are posted">
          <TextInput value={cfg.birthdayChannelId} onChange={v => set('birthdayChannelId', v)} placeholder="Channel ID…" />
        </Field>
        <Field label="Report Channel ID" hint="Where member reports are sent">
          <TextInput value={cfg.reportChannelId} onChange={v => set('reportChannelId', v)} placeholder="Channel ID…" />
        </Field>
      </SectionCard>

      <div className="flex justify-end">
        <SaveButton onClick={handleSave} saving={saving} saved={saved} />
      </div>
    </div>
  )
}

function NoGuild() {
  return (
    <div className="flex flex-col items-center justify-center h-64 text-center">
      <p className="text-4xl mb-3">🏠</p>
      <p className="text-gray-300 font-medium">No server found</p>
      <p className="text-gray-500 text-sm mt-1">The database has no guilds yet. Make sure the bot has joined a server.</p>
    </div>
  )
}

function Skeleton() {
  return (
    <div className="max-w-2xl space-y-4 animate-pulse">
      {[1, 2, 3].map(i => (
        <div key={i} className="bg-[#1a1d27] border border-[#1e2130] rounded-xl h-48" />
      ))}
    </div>
  )
}

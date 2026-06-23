import { useState, useEffect } from 'react'
import { useGuild } from '../context/GuildContext.jsx'
import { SectionCard, Field, TextInput, Toggle, SaveButton } from '../components/SectionCard.jsx'

export default function Leveling() {
  const { fetchSection, saveSection, selectedGuildId } = useGuild()
  const [cfg, setCfg] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!selectedGuildId) return
    setLoading(true)
    fetchSection('leveling').then(setCfg).catch(console.error).finally(() => setLoading(false))
    setSaved(false)
  }, [selectedGuildId])

  function set(key, value) {
    setCfg(c => ({ ...c, [key]: value }))
    setSaved(false)
  }

  function setXpRange(field, value) {
    const current = typeof cfg.xpPerMessage === 'object' && cfg.xpPerMessage !== null
      ? cfg.xpPerMessage
      : { min: 15, max: 25 }
    setCfg(c => ({ ...c, xpPerMessage: { ...current, [field]: Number(value) } }))
    setSaved(false)
  }

  async function handleSave() {
    setSaving(true)
    try {
      await saveSection('leveling', cfg)
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

  const xpRange = typeof cfg.xpPerMessage === 'object' && cfg.xpPerMessage !== null
    ? cfg.xpPerMessage
    : { min: 15, max: 25 }

  const ignoredChannels = Array.isArray(cfg.ignoredChannels) ? cfg.ignoredChannels : []
  const ignoredRoles = Array.isArray(cfg.ignoredRoles) ? cfg.ignoredRoles : []

  return (
    <div className="max-w-2xl">
      <SectionCard title="Leveling System" description="Enable or disable the XP leveling system.">
        <Field label="Enable Leveling">
          <Toggle value={cfg.enabled} onChange={v => set('enabled', v)} label="Award XP for messages" />
        </Field>
      </SectionCard>

      <SectionCard title="XP Settings" description="Control how much XP members earn per message.">
        <Field label="Min XP Per Message" hint="Minimum XP awarded for each message sent">
          <input
            type="number"
            min={1}
            max={xpRange.max}
            value={xpRange.min}
            onChange={e => setXpRange('min', e.target.value)}
            className="w-28 bg-[#0f1117] border border-[#2a2d3e] text-gray-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </Field>
        <Field label="Max XP Per Message" hint="Maximum XP awarded for each message sent">
          <input
            type="number"
            min={xpRange.min}
            max={1000}
            value={xpRange.max}
            onChange={e => setXpRange('max', e.target.value)}
            className="w-28 bg-[#0f1117] border border-[#2a2d3e] text-gray-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </Field>
        <Field label="XP Cooldown (seconds)" hint="Seconds between XP grants for the same user (0 = no cooldown)">
          <input
            type="number"
            min={0}
            max={3600}
            value={cfg.xpCooldown ?? 20}
            onChange={e => set('xpCooldown', Number(e.target.value))}
            className="w-28 bg-[#0f1117] border border-[#2a2d3e] text-gray-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </Field>
      </SectionCard>

      <SectionCard title="Level-Up Notifications" description="How and where level-up messages are sent.">
        <Field label="Send Level-Up Messages">
          <Toggle value={cfg.announceLevelUp !== false} onChange={v => set('announceLevelUp', v)} label="Notify members when they level up" />
        </Field>
        <Field label="Level-Up Channel ID" hint="Leave blank to send in the same channel as the triggering message">
          <TextInput value={cfg.levelUpChannel} onChange={v => set('levelUpChannel', v)} placeholder="Channel ID… (optional)" />
        </Field>
        <Field label="Level-Up Message" hint="Use {user} for mention, {level} for the new level">
          <textarea
            value={cfg.levelUpMessage ?? ''}
            onChange={e => set('levelUpMessage', e.target.value)}
            placeholder="{user} has leveled up to level {level}!"
            rows={2}
            className="w-full bg-[#0f1117] border border-[#2a2d3e] text-gray-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500 placeholder-gray-600 resize-none"
          />
        </Field>
      </SectionCard>

      <SectionCard title="Role Rewards" description="Grant roles at specific levels. Format: level → Role ID.">
        <RoleRewards roles={cfg.roleRewards || {}} onChange={v => set('roleRewards', v)} />
      </SectionCard>

      <SectionCard title="Ignore Lists" description="Channels and roles excluded from XP gain.">
        <Field label="Ignored Channels" hint="Channel IDs where XP is not awarded (one per line)">
          <IDListTextarea
            values={ignoredChannels}
            onChange={v => set('ignoredChannels', v)}
            placeholder="Channel ID…"
          />
        </Field>
        <Field label="Ignored Roles" hint="Role IDs that do not earn XP (one per line)">
          <IDListTextarea
            values={ignoredRoles}
            onChange={v => set('ignoredRoles', v)}
            placeholder="Role ID…"
          />
        </Field>
      </SectionCard>

      <div className="flex justify-end">
        <SaveButton onClick={handleSave} saving={saving} saved={saved} />
      </div>
    </div>
  )
}

function IDListTextarea({ values, onChange, placeholder }) {
  return (
    <textarea
      value={values.join('\n')}
      onChange={e => onChange(e.target.value.split('\n').map(s => s.trim()).filter(Boolean))}
      placeholder={placeholder}
      rows={4}
      className="w-full bg-[#0f1117] border border-[#2a2d3e] text-gray-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500 placeholder-gray-600 resize-none font-mono"
    />
  )
}

function RoleRewards({ roles, onChange }) {
  const entries = Object.entries(roles)

  function updateLevel(oldLevel, newLevel) {
    const updated = { ...roles }
    const val = updated[oldLevel]
    delete updated[oldLevel]
    updated[newLevel] = val
    onChange(updated)
  }

  function updateRole(level, roleId) {
    onChange({ ...roles, [level]: roleId })
  }

  function addEntry() {
    onChange({ ...roles, '': '' })
  }

  function removeEntry(level) {
    const updated = { ...roles }
    delete updated[level]
    onChange(updated)
  }

  return (
    <div className="space-y-2">
      {entries.map(([level, roleId], i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="w-28">
            <input
              type="number"
              value={level}
              onChange={e => updateLevel(level, e.target.value)}
              placeholder="Level"
              className="w-full bg-[#0f1117] border border-[#2a2d3e] text-gray-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <span className="text-gray-500 text-sm shrink-0">→</span>
          <div className="flex-1">
            <input
              value={roleId}
              onChange={e => updateRole(level, e.target.value)}
              placeholder="Role ID…"
              className="w-full bg-[#0f1117] border border-[#2a2d3e] text-gray-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <button onClick={() => removeEntry(level)} className="text-red-400 hover:text-red-300 text-sm px-2">✕</button>
        </div>
      ))}
      <button onClick={addEntry} className="text-brand-400 hover:text-brand-300 text-sm font-medium mt-1">+ Add Reward</button>
    </div>
  )
}

function NoGuild() { return <div className="text-gray-500 text-sm">No server selected.</div> }
function Skeleton() {
  return <div className="max-w-2xl space-y-4 animate-pulse">{[1,2,3].map(i => <div key={i} className="bg-[#1a1d27] border border-[#1e2130] rounded-xl h-40" />)}</div>
}

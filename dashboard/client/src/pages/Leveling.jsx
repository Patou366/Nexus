import { useState, useEffect } from 'react'
import { useGuild } from '../context/GuildContext.jsx'
import { SectionCard, Field, TextInput, Toggle, SliderInput, SaveButton } from '../components/SectionCard.jsx'

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

  return (
    <div className="max-w-2xl">
      <SectionCard title="Leveling System" description="Enable or disable the XP leveling system.">
        <Field label="Enable Leveling">
          <Toggle value={cfg.enabled} onChange={v => set('enabled', v)} label="Award XP for messages" />
        </Field>
      </SectionCard>

      <SectionCard title="XP Settings" description="Control how much XP members earn.">
        <Field label="XP Per Message" hint="Base XP awarded for each message sent">
          <SliderInput value={cfg.xpPerMessage ?? 10} onChange={v => set('xpPerMessage', v)} min={1} max={100} step={1} unit=" XP" />
        </Field>
        <Field label="XP Per Minute (Voice)" hint="XP earned per minute in a voice channel">
          <SliderInput value={cfg.xpPerMinute ?? 60} onChange={v => set('xpPerMinute', v)} min={0} max={300} step={5} unit=" XP" />
        </Field>
        <Field label="Cooldown">
          <Toggle value={cfg.cooldownEnabled} onChange={v => set('cooldownEnabled', v)} label="Apply per-message cooldown to prevent farming" />
        </Field>
        <Field label="Message Length Multiplier">
          <Toggle value={cfg.messageLengthMultiplier} onChange={v => set('messageLengthMultiplier', v)} label="Give bonus XP for longer messages" />
        </Field>
      </SectionCard>

      <SectionCard title="Level-Up Notifications" description="How and where level-up messages are sent.">
        <Field label="Send Level-Up Messages">
          <Toggle value={cfg.levelUpMessages} onChange={v => set('levelUpMessages', v)} label="Notify members when they level up" />
        </Field>
        <Field label="Level-Up Channel ID" hint="Leave blank to send in the same channel as the message">
          <TextInput value={cfg.levelUpChannel} onChange={v => set('levelUpChannel', v)} placeholder="Channel ID… (optional)" />
        </Field>
      </SectionCard>

      <SectionCard title="Role Rewards" description="Grant roles at specific levels. Format: level → Role ID.">
        <RoleRewards roles={cfg.roles || {}} onChange={v => set('roles', v)} />
      </SectionCard>

      <div className="flex justify-end">
        <SaveButton onClick={handleSave} saving={saving} saved={saved} />
      </div>
    </div>
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

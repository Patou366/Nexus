import { useState, useEffect } from 'react'
import { useGuild } from '../context/GuildContext.jsx'
import { SectionCard, Field, TextInput, Toggle, SaveButton } from '../components/SectionCard.jsx'

export default function RaidShield() {
  const { fetchSection, saveSection, selectedGuildId } = useGuild()
  const [cfg, setCfg] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!selectedGuildId) return
    setLoading(true)
    fetchSection('config')
      .then(data => setCfg(data.raidShield || {}))
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
      await saveSection('config', { raidShield: cfg })
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

  return (
    <div className="max-w-2xl">
      <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-5 py-4 mb-5 flex items-start gap-3">
        <span className="text-xl mt-0.5">⚠️</span>
        <div>
          <p className="text-yellow-300 font-medium text-sm">High-impact settings</p>
          <p className="text-yellow-400/70 text-xs mt-0.5">Raid Shield can quarantine or auto-ban members. Test in a safe environment before enabling in production.</p>
        </div>
      </div>

      <SectionCard title="Raid Detection" description="Enable the anti-raid system and set alert targets.">
        <Field label="Enable Raid Shield">
          <Toggle value={cfg.enabled} onChange={v => set('enabled', v)} label="Detect and respond to raids automatically" />
        </Field>
        <Field label="Notification Channel ID" hint="Where raid alerts are posted">
          <TextInput value={cfg.notificationChannelId} onChange={v => set('notificationChannelId', v)} placeholder="Channel ID…" />
        </Field>
        <Field label="Alert Role ID" hint="Role pinged when a raid is detected">
          <TextInput value={cfg.alertRoleId} onChange={v => set('alertRoleId', v)} placeholder="Role ID…" />
        </Field>
        <Field label="Auto-Ban Raiders">
          <Toggle value={cfg.autoBan} onChange={v => set('autoBan', v)} label="Automatically ban detected raiders" />
        </Field>
      </SectionCard>

      <SectionCard title="Quarantine" description="Quarantine suspected raiders instead of banning immediately.">
        <Field label="Verified Role ID" hint="Role members must have to bypass quarantine">
          <TextInput value={cfg.verifiedRoleId} onChange={v => set('verifiedRoleId', v)} placeholder="Role ID…" />
        </Field>
        <Field label="Quarantine Role ID" hint="Role applied to quarantined users (restrict channel access)">
          <TextInput value={cfg.quarantineRoleId} onChange={v => set('quarantineRoleId', v)} placeholder="Role ID…" />
        </Field>
        <Field label="Quarantine Channel ID" hint="The only channel quarantined users can see">
          <TextInput value={cfg.quarantineChannelId} onChange={v => set('quarantineChannelId', v)} placeholder="Channel ID…" />
        </Field>
      </SectionCard>

      <SectionCard title="AI Moderation" description="Use Google Gemini to assist with content analysis during raids.">
        <Field label="Enable AI Moderation">
          <Toggle
            value={cfg.aiModeration?.enabled}
            onChange={v => set('aiModeration', { ...(cfg.aiModeration || {}), enabled: v })}
            label="Use Gemini AI to analyze flagged content"
          />
        </Field>
        <Field label="AI Sensitivity" hint="Higher = stricter. Requires GEMINI_API_KEY to be set in secrets.">
          <select
            value={cfg.aiModeration?.sensitivity || 'medium'}
            onChange={e => set('aiModeration', { ...(cfg.aiModeration || {}), sensitivity: e.target.value })}
            className="w-full bg-[#0f1117] border border-[#2a2d3e] text-gray-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </Field>
      </SectionCard>

      <div className="flex justify-end">
        <SaveButton onClick={handleSave} saving={saving} saved={saved} />
      </div>
    </div>
  )
}

function Skeleton() {
  return <div className="max-w-2xl space-y-4 animate-pulse">{[1,2,3].map(i => <div key={i} className="bg-[#1a1d27] border border-[#1e2130] rounded-xl h-40" />)}</div>
}

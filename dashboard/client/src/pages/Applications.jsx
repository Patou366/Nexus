import { useState, useEffect } from 'react'
import { useGuild } from '../context/GuildContext.jsx'
import { SectionCard, Field, TextInput, Toggle, SaveButton } from '../components/SectionCard.jsx'

export default function Applications() {
  const { fetchSection, saveSection, selectedGuildId } = useGuild()
  const [cfg, setCfg] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!selectedGuildId) return
    setLoading(true)
    fetchSection('applications').then(setCfg).catch(console.error).finally(() => setLoading(false))
    setSaved(false)
  }, [selectedGuildId])

  function set(key, value) {
    setCfg(c => ({ ...c, [key]: value }))
    setSaved(false)
  }

  function setRoles(key, value) {
    setCfg(c => ({ ...c, roles: { ...(c.roles || {}), [key]: value } }))
    setSaved(false)
  }

  async function handleSave() {
    setSaving(true)
    try {
      await saveSection('applications', cfg)
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

  const roles = cfg.roles || {}

  return (
    <div className="max-w-2xl">
      <SectionCard title="Application System" description="Enable and configure the applications feature.">
        <Field label="Enable Applications">
          <Toggle value={cfg.enabled} onChange={v => set('enabled', v)} label="Allow members to submit applications" />
        </Field>
        <Field label="Application Channel ID" hint="Where application submissions are posted">
          <TextInput value={cfg.applicationChannelId} onChange={v => set('applicationChannelId', v)} placeholder="Channel ID…" />
        </Field>
        <Field label="Log Channel ID" hint="Where application decisions are logged">
          <TextInput value={cfg.logChannelId} onChange={v => set('logChannelId', v)} placeholder="Channel ID…" />
        </Field>
      </SectionCard>

      <SectionCard title="Application Questions" description="Questions asked in the application modal. One per line.">
        <textarea
          value={(cfg.questions || []).join('\n')}
          onChange={e => set('questions', e.target.value.split('\n').map(s => s.trim()).filter(Boolean))}
          placeholder={"What is your age?\nWhy do you want to join?\nWhat can you contribute?"}
          rows={6}
          className="w-full bg-[#0f1117] border border-[#2a2d3e] text-gray-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500 placeholder-gray-600 resize-none"
        />
      </SectionCard>

      <SectionCard title="Roles" description="Roles for reviewers and application outcomes.">
        <Field label="Admin Role ID">
          <TextInput value={roles.admin} onChange={v => setRoles('admin', v)} placeholder="Role ID…" />
        </Field>
        <Field label="Reviewer Role ID">
          <TextInput value={roles.reviewer} onChange={v => setRoles('reviewer', v)} placeholder="Role ID…" />
        </Field>
        <Field label="Accepted Role ID" hint="Granted when application is accepted">
          <TextInput value={roles.accepted} onChange={v => setRoles('accepted', v)} placeholder="Role ID…" />
        </Field>
        <Field label="Denied Role ID" hint="Granted when application is denied">
          <TextInput value={roles.denied} onChange={v => setRoles('denied', v)} placeholder="Role ID…" />
        </Field>
      </SectionCard>

      <SectionCard title="Requirements & Limits" description="Eligibility requirements and submission limits.">
        <Field label="Require Verification">
          <Toggle value={cfg.requireVerification} onChange={v => set('requireVerification', v)} label="Member must be verified to apply" />
        </Field>
        <Field label="Min Account Age (days)" hint="0 = no minimum">
          <input
            type="number" min="0"
            value={cfg.minAccountAge ?? 0}
            onChange={e => set('minAccountAge', Number(e.target.value))}
            className="w-32 bg-[#0f1117] border border-[#2a2d3e] text-gray-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </Field>
        <Field label="Max Open Applications" hint="Per user; 0 = unlimited">
          <input
            type="number" min="0"
            value={cfg.maxApplications ?? 1}
            onChange={e => set('maxApplications', Number(e.target.value))}
            className="w-32 bg-[#0f1117] border border-[#2a2d3e] text-gray-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </Field>
        <Field label="Cooldown (hours)" hint="How long before the same user can apply again">
          <input
            type="number" min="0"
            value={cfg.cooldown ?? 7}
            onChange={e => set('cooldown', Number(e.target.value))}
            className="w-32 bg-[#0f1117] border border-[#2a2d3e] text-gray-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
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

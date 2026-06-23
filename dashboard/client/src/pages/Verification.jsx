import { useState, useEffect } from 'react'
import { useGuild } from '../context/GuildContext.jsx'
import { SectionCard, Field, TextInput, Toggle, SelectInput, SaveButton } from '../components/SectionCard.jsx'

const CRITERIA_OPTIONS = [
  { value: 'none',        label: 'None (manual only)' },
  { value: 'account_age', label: 'Account Age' },
  { value: 'server_size', label: 'Server Size' },
]

export default function Verification() {
  const { fetchSection, saveSection, selectedGuildId } = useGuild()
  const [cfg, setCfg] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!selectedGuildId) return
    setLoading(true)
    fetchSection('config').then(setCfg).catch(console.error).finally(() => setLoading(false))
    setSaved(false)
  }, [selectedGuildId])

  function setV(key, value) {
    setCfg(c => ({ ...c, verification: { ...(c.verification || {}), [key]: value } }))
    setSaved(false)
  }

  function setAV(key, value) {
    setCfg(c => ({
      ...c,
      verification: {
        ...(c.verification || {}),
        autoVerify: { ...((c.verification || {}).autoVerify || {}), [key]: value }
      }
    }))
    setSaved(false)
  }

  async function handleSave() {
    setSaving(true)
    try {
      await saveSection('config', { verification: cfg.verification })
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

  const v = cfg.verification || {}
  const av = v.autoVerify || {}

  return (
    <div className="max-w-2xl">
      <SectionCard title="Verification Gate" description="Verification channel and role assignment.">
        <Field label="Enable Verification">
          <Toggle value={v.enabled} onChange={val => setV('enabled', val)} label="Require new members to verify" />
        </Field>
        <Field label="Verification Channel ID" hint="Channel where the verify button is posted">
          <TextInput value={v.channelId} onChange={val => setV('channelId', val)} placeholder="Channel ID…" />
        </Field>
        <Field label="Verified Role ID" hint="Role granted on successful verification">
          <TextInput value={v.roleId} onChange={val => setV('roleId', val)} placeholder="Role ID…" />
        </Field>
        <Field label="Button Text" hint="Text shown on the verify button">
          <TextInput value={v.buttonText} onChange={val => setV('buttonText', val)} placeholder="Verify Me" />
        </Field>
        <Field label="Verification Message" hint="Embed message shown in the verification channel">
          <textarea
            value={v.message ?? ''}
            onChange={e => setV('message', e.target.value)}
            placeholder="Click the button below to verify yourself."
            rows={3}
            className="w-full bg-[#0f1117] border border-[#2a2d3e] text-gray-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500 placeholder-gray-600 resize-none"
          />
        </Field>
      </SectionCard>

      <SectionCard title="Auto-Verify" description="Automatically verify members who meet certain criteria.">
        <Field label="Enable Auto-Verify">
          <Toggle value={av.enabled} onChange={val => setAV('enabled', val)} label="Automatically verify eligible members" />
        </Field>
        <Field label="Criteria" hint="The condition members must meet to be auto-verified">
          <SelectInput value={av.criteria} onChange={val => setAV('criteria', val)} options={CRITERIA_OPTIONS} />
        </Field>
        {av.criteria === 'account_age' && (
          <Field label="Minimum Account Age" hint="Days old the Discord account must be">
            <div className="flex items-center gap-3">
              <input
                type="number"
                min="0"
                value={av.accountAgeDays ?? 7}
                onChange={e => setAV('accountAgeDays', Number(e.target.value))}
                className="w-28 bg-[#0f1117] border border-[#2a2d3e] text-gray-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <span className="text-gray-500 text-sm">days</span>
            </div>
          </Field>
        )}
        <Field label="Auto-Verify Role ID" hint="Role granted automatically (can differ from main verified role)">
          <TextInput value={av.roleId} onChange={val => setAV('roleId', val)} placeholder="Role ID…" />
        </Field>
      </SectionCard>

      <div className="flex justify-end">
        <SaveButton onClick={handleSave} saving={saving} saved={saved} />
      </div>
    </div>
  )
}

function Skeleton() {
  return <div className="max-w-2xl space-y-4 animate-pulse">{[1,2].map(i => <div key={i} className="bg-[#1a1d27] border border-[#1e2130] rounded-xl h-48" />)}</div>
}

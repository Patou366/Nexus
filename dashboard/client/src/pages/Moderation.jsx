import { useState, useEffect } from 'react'
import { useGuild } from '../context/GuildContext.jsx'
import { SectionCard, Field, TextInput, SaveButton } from '../components/SectionCard.jsx'

export default function Moderation() {
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

  function set(key, value) {
    setCfg(c => ({ ...c, [key]: value }))
    setSaved(false)
  }

  async function handleSave() {
    setSaving(true)
    try {
      await saveSection('config', {
        logChannelId: cfg.logChannelId,
        logIgnore: cfg.logIgnore,
      })
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
      <SectionCard title="Moderation Settings" description="Core moderation configuration.">
        <Field label="Mod Log Channel ID" hint="Channel where moderation actions are logged">
          <TextInput value={cfg.logChannelId} onChange={v => set('logChannelId', v)} placeholder="Channel ID…" />
        </Field>
      </SectionCard>

      <SectionCard title="Ignore Lists" description="Users and channels exempt from mod logging.">
        <Field label="Ignored Users" hint="User IDs excluded from mod logs (one per line)">
          <IDListTextarea
            values={Array.isArray(cfg.logIgnore?.users) ? cfg.logIgnore.users : []}
            onChange={v => set('logIgnore', { ...(cfg.logIgnore || {}), users: v })}
            placeholder="User ID…"
          />
        </Field>
        <Field label="Ignored Channels" hint="Channel IDs excluded from mod logs (one per line)">
          <IDListTextarea
            values={Array.isArray(cfg.logIgnore?.channels) ? cfg.logIgnore.channels : []}
            onChange={v => set('logIgnore', { ...(cfg.logIgnore || {}), channels: v })}
            placeholder="Channel ID…"
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

function Skeleton() {
  return <div className="max-w-2xl space-y-4 animate-pulse">{[1,2].map(i => <div key={i} className="bg-[#1a1d27] border border-[#1e2130] rounded-xl h-40" />)}</div>
}

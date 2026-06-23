import { useState, useEffect } from 'react'
import { useGuild } from '../context/GuildContext.jsx'
import { SectionCard, Field, TextInput, Toggle, SaveButton } from '../components/SectionCard.jsx'

export default function JoinToCreate() {
  const { fetchSection, saveSection, selectedGuildId } = useGuild()
  const [cfg, setCfg] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!selectedGuildId) return
    setLoading(true)
    fetchSection('joinToCreate')
      .then(data => {
        const display = { ...data }
        if (typeof display.bitrate === 'number') {
          display.bitrate = Math.round(display.bitrate / 1000)
        }
        setCfg(display)
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
      const payload = { ...cfg }
      payload.bitrate = (Number(payload.bitrate) || 64) * 1000
      await saveSection('joinToCreate', payload)
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
      <SectionCard title="Join To Create" description="Automatically create temporary voice channels when a member joins a trigger channel.">
        <Field label="Enable Join To Create">
          <Toggle value={cfg.enabled} onChange={v => set('enabled', v)} label="Auto-create voice channels on join" />
        </Field>
        <Field label="Category ID" hint="Category where temporary channels are created">
          <TextInput value={cfg.categoryId} onChange={v => set('categoryId', v)} placeholder="Category ID…" />
        </Field>
      </SectionCard>

      <SectionCard title="Trigger Channels" description="Members joining these channels trigger a new voice channel creation.">
        <TriggerList channels={cfg.triggerChannels || []} onChange={v => set('triggerChannels', v)} />
      </SectionCard>

      <SectionCard title="Channel Settings" description="Template and limits for created channels.">
        <Field label="Channel Name Template" hint="Use {username} for creator's name, {count} for auto-increment">
          <TextInput value={cfg.channelNameTemplate} onChange={v => set('channelNameTemplate', v)} placeholder="{username}'s Room" />
        </Field>
        <Field label="User Limit" hint="0 = no limit">
          <input
            type="number" min="0" max="99"
            value={cfg.userLimit ?? 0}
            onChange={e => set('userLimit', Number(e.target.value))}
            className="w-24 bg-[#0f1117] border border-[#2a2d3e] text-gray-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </Field>
        <Field label="Bitrate (kbps)" hint="Voice channel audio quality — min 8, max 384">
          <input
            type="number" min="8" max="384"
            value={cfg.bitrate ?? 64}
            onChange={e => set('bitrate', Number(e.target.value))}
            className="w-24 bg-[#0f1117] border border-[#2a2d3e] text-gray-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </Field>
      </SectionCard>

      <div className="flex justify-end">
        <SaveButton onClick={handleSave} saving={saving} saved={saved} />
      </div>
    </div>
  )
}

function TriggerList({ channels, onChange }) {
  function update(idx, val) {
    const next = [...channels]; next[idx] = val; onChange(next)
  }
  function add() { onChange([...channels, '']) }
  function remove(idx) { onChange(channels.filter((_, i) => i !== idx)) }

  return (
    <div className="space-y-2">
      {channels.map((id, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            value={id}
            onChange={e => update(i, e.target.value)}
            placeholder="Voice Channel ID…"
            className="flex-1 bg-[#0f1117] border border-[#2a2d3e] text-gray-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <button onClick={() => remove(i)} className="text-red-400 hover:text-red-300 px-2 text-sm">✕</button>
        </div>
      ))}
      <button onClick={add} className="text-brand-400 hover:text-brand-300 text-sm font-medium">+ Add Trigger Channel</button>
    </div>
  )
}

function Skeleton() {
  return <div className="max-w-2xl space-y-4 animate-pulse">{[1,2,3].map(i => <div key={i} className="bg-[#1a1d27] border border-[#1e2130] rounded-xl h-40" />)}</div>
}

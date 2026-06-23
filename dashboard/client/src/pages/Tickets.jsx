import { useState, useEffect } from 'react'
import { useGuild } from '../context/GuildContext.jsx'
import { SectionCard, Field, TextInput, Toggle, SaveButton } from '../components/SectionCard.jsx'

export default function Tickets() {
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

  function setTicketLog(key, value) {
    setCfg(c => ({ ...c, ticketLogging: { ...(c.ticketLogging || {}), [key]: value } }))
    setSaved(false)
  }

  async function handleSave() {
    setSaving(true)
    try {
      await saveSection('config', {
        ticketCategoryId: cfg.ticketCategoryId,
        ticketStaffRoleId: cfg.ticketStaffRoleId,
        maxTicketsPerUser: cfg.maxTicketsPerUser,
        dmOnClose: cfg.dmOnClose,
        ticketLogging: cfg.ticketLogging,
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

  const ticketLogging = cfg.ticketLogging || {}

  return (
    <div className="max-w-2xl">
      <SectionCard title="Ticket Setup" description="Category and staff role for ticket channels.">
        <Field label="Ticket Category ID" hint="Category under which ticket channels are created">
          <TextInput value={cfg.ticketCategoryId} onChange={v => set('ticketCategoryId', v)} placeholder="Category ID…" />
        </Field>
        <Field label="Staff Role ID" hint="Role that can view and manage tickets">
          <TextInput value={cfg.ticketStaffRoleId} onChange={v => set('ticketStaffRoleId', v)} placeholder="Role ID…" />
        </Field>
        <Field label="Max Tickets Per User" hint="0 = unlimited">
          <input
            type="number"
            min="0"
            value={cfg.maxTicketsPerUser ?? 3}
            onChange={e => set('maxTicketsPerUser', Number(e.target.value))}
            className="w-32 bg-[#0f1117] border border-[#2a2d3e] text-gray-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </Field>
      </SectionCard>

      <SectionCard title="Ticket Logging" description="Where ticket events and transcripts are sent.">
        <Field label="Lifecycle Channel ID" hint="Ticket open / close notifications">
          <TextInput value={ticketLogging.lifecycleChannelId} onChange={v => setTicketLog('lifecycleChannelId', v)} placeholder="Channel ID…" />
        </Field>
        <Field label="Transcript Channel ID" hint="Full transcript posted here on close">
          <TextInput value={ticketLogging.transcriptChannelId} onChange={v => setTicketLog('transcriptChannelId', v)} placeholder="Channel ID…" />
        </Field>
      </SectionCard>

      <SectionCard title="Behaviour" description="Options for how tickets behave when closed.">
        <Field label="DM on Close">
          <Toggle value={cfg.dmOnClose !== false} onChange={v => set('dmOnClose', v)} label="DM the user when their ticket is closed" />
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

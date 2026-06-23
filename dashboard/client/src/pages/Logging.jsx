import { useState, useEffect } from 'react'
import { useGuild } from '../context/GuildContext.jsx'
import { SectionCard, Field, TextInput, Toggle, SaveButton } from '../components/SectionCard.jsx'

const LOG_EVENTS = [
  ['moderation.ban',         'Member Banned'],
  ['moderation.kick',        'Member Kicked'],
  ['moderation.mute',        'Member Muted / Timed Out'],
  ['moderation.warn',        'Member Warned'],
  ['moderation.purge',       'Messages Purged'],
  ['message.delete',         'Message Deleted'],
  ['message.edit',           'Message Edited'],
  ['message.bulkdelete',     'Messages Bulk Deleted'],
  ['member.join',            'Member Joined'],
  ['member.leave',           'Member Left'],
  ['member.namechange',      'Nickname / Name Changed'],
  ['role.create',            'Role Created'],
  ['role.delete',            'Role Deleted'],
  ['role.update',            'Role Updated'],
  ['ticket.create',          'Ticket Created'],
  ['ticket.close',           'Ticket Closed'],
  ['ticket.claim',           'Ticket Claimed'],
  ['ticket.priority',        'Ticket Priority Changed'],
  ['ticket.transcript',      'Ticket Transcript Saved'],
  ['ticket.delete',          'Ticket Deleted'],
  ['leveling.levelup',       'Member Leveled Up'],
  ['leveling.milestone',     'Level Milestone Reached'],
  ['reactionrole.add',       'Reaction Role Added'],
  ['reactionrole.remove',    'Reaction Role Removed'],
  ['reactionrole.create',    'Reaction Role Created'],
  ['reactionrole.delete',    'Reaction Role Deleted'],
  ['reactionrole.update',    'Reaction Role Updated'],
  ['giveaway.create',        'Giveaway Created'],
  ['giveaway.winner',        'Giveaway Winner Picked'],
  ['giveaway.reroll',        'Giveaway Rerolled'],
  ['giveaway.delete',        'Giveaway Deleted'],
  ['counter.update',         'Server Counter Updated'],
]

export default function Logging() {
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

  function setLog(key, value) {
    setCfg(c => ({ ...c, logging: { ...(c.logging || {}), [key]: value } }))
    setSaved(false)
  }

  function setEvent(eventKey, value) {
    const events = cfg.logging?.enabledEvents || {}
    setLog('enabledEvents', { ...events, [eventKey]: value })
  }

  async function handleSave() {
    setSaving(true)
    try {
      await saveSection('config', {
        logging: cfg.logging,
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

  if (!selectedGuildId) return <NoGuild />
  if (loading) return <Skeleton />

  const logging = cfg.logging || {}

  return (
    <div className="max-w-2xl">
      <SectionCard title="General Logging" description="Main log channel settings.">
        <Field label="Enable Logging">
          <Toggle value={logging.enabled} onChange={v => setLog('enabled', v)} label="Log events to a channel" />
        </Field>
        <Field label="Log Channel ID" hint="Channel where all modlog events are posted">
          <TextInput value={logging.channelId} onChange={v => setLog('channelId', v)} placeholder="Channel ID…" />
        </Field>
      </SectionCard>

      <SectionCard title="Event Toggles" description="Choose exactly which events get logged.">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {LOG_EVENTS.map(([key, label]) => (
            <div key={key} className="flex items-center justify-between bg-[#0f1117] rounded-lg px-4 py-2.5">
              <span className="text-gray-300 text-sm">{label}</span>
              <Toggle
                value={logging.enabledEvents?.[key] ?? false}
                onChange={v => setEvent(key, v)}
              />
            </div>
          ))}
        </div>
      </SectionCard>

      <div className="flex justify-end">
        <SaveButton onClick={handleSave} saving={saving} saved={saved} />
      </div>
    </div>
  )
}

function NoGuild() {
  return <div className="text-gray-500 text-sm">No server selected.</div>
}
function Skeleton() {
  return <div className="max-w-2xl space-y-4 animate-pulse">{[1,2,3].map(i => <div key={i} className="bg-[#1a1d27] border border-[#1e2130] rounded-xl h-40" />)}</div>
}

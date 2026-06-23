import { useState, useEffect } from 'react'
import { useGuild } from '../context/GuildContext.jsx'
import { SectionCard, Field, TextInput, Toggle, SaveButton } from '../components/SectionCard.jsx'

const AUTOMOD_RULES = [
  ['blockInvites',       'Block Discord Invites',       'Remove messages containing invite links'],
  ['blockLinks',         'Block External Links',        'Remove messages with external URLs'],
  ['blockMassMention',   'Block Mass Mentions',         'Remove messages mentioning many users at once'],
  ['blockCaps',          'Block Excessive Caps',        'Remove messages written in all caps'],
  ['blockSpam',          'Block Spam / Flooding',       'Limit repeated messages from same user'],
  ['blockSlurs',         'Block Slurs',                 'Remove messages containing prohibited words'],
  ['blockSpoofedLinks',  'Block Spoofed Links',         'Detect misleading URLs'],
  ['scamDetection',      'Scam Detection',              'Flag and remove known scam patterns'],
  ['aiModeration',       'AI Moderation (Gemini)',      'Use Google Gemini to flag harmful content'],
]

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

  function setAutomod(key, value) {
    setCfg(c => ({ ...c, automod: { ...(c.automod || {}), [key]: value } }))
    setSaved(false)
  }

  async function handleSave() {
    setSaving(true)
    try {
      await saveSection('config', {
        automod: cfg.automod,
        logChannelId: cfg.logChannelId,
        muteRoleId: cfg.muteRoleId,
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

  const automod = cfg.automod || {}

  return (
    <div className="max-w-2xl">
      <SectionCard title="Moderation Settings" description="Core moderation configuration.">
        <Field label="Mod Log Channel ID" hint="Channel where moderation actions are logged">
          <TextInput value={cfg.logChannelId} onChange={v => set('logChannelId', v)} placeholder="Channel ID…" />
        </Field>
        <Field label="Mute Role ID" hint="Role applied when a member is muted/timed out via role">
          <TextInput value={cfg.muteRoleId} onChange={v => set('muteRoleId', v)} placeholder="Role ID…" />
        </Field>
      </SectionCard>

      <SectionCard title="AutoMod Rules" description="Automatic content filtering rules.">
        <div className="space-y-1">
          {AUTOMOD_RULES.map(([key, label, hint]) => (
            <div key={key} className="flex items-start justify-between bg-[#0f1117] rounded-lg px-4 py-3">
              <div>
                <p className="text-gray-200 text-sm font-medium">{label}</p>
                <p className="text-gray-500 text-xs mt-0.5">{hint}</p>
              </div>
              <Toggle value={automod[key]} onChange={v => setAutomod(key, v)} />
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Ignore Lists" description="Users and channels exempt from automod.">
        <Field label="Ignored Users" hint="User IDs to exempt from automod (one per line)">
          <IDListTextarea
            values={Array.isArray(cfg.logIgnore?.users) ? cfg.logIgnore.users : []}
            onChange={v => set('logIgnore', { ...(cfg.logIgnore || {}), users: v })}
            placeholder="User ID…"
          />
        </Field>
        <Field label="Ignored Channels" hint="Channel IDs exempt from automod (one per line)">
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
  return <div className="max-w-2xl space-y-4 animate-pulse">{[1,2,3].map(i => <div key={i} className="bg-[#1a1d27] border border-[#1e2130] rounded-xl h-40" />)}</div>
}

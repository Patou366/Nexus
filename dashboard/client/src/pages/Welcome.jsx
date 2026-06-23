import { useState, useEffect } from 'react'
import { useGuild } from '../context/GuildContext.jsx'
import { SectionCard, Field, TextInput, Toggle, SaveButton } from '../components/SectionCard.jsx'

export default function Welcome() {
  const { fetchSection, saveSection, selectedGuildId } = useGuild()
  const [cfg, setCfg] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!selectedGuildId) return
    setLoading(true)
    fetchSection('welcome').then(setCfg).catch(console.error).finally(() => setLoading(false))
    setSaved(false)
  }, [selectedGuildId])

  function set(key, value) {
    setCfg(c => ({ ...c, [key]: value }))
    setSaved(false)
  }

  function setEmbed(key, value) {
    setCfg(c => ({ ...c, welcomeEmbed: { ...(c.welcomeEmbed || {}), [key]: value } }))
    setSaved(false)
  }

  function setLeaveEmbed(key, value) {
    setCfg(c => ({ ...c, leaveEmbed: { ...(c.leaveEmbed || {}), [key]: value } }))
    setSaved(false)
  }

  async function handleSave() {
    setSaving(true)
    try {
      await saveSection('welcome', cfg)
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

  const embed = cfg.welcomeEmbed || {}
  const leaveEmbed = cfg.leaveEmbed || {}

  return (
    <div className="max-w-2xl">
      <SectionCard title="Welcome Messages" description="Greet new members with a message or embed.">
        <Field label="Enable Welcome">
          <Toggle value={cfg.enabled} onChange={v => set('enabled', v)} label="Send a welcome message when members join" />
        </Field>
        <Field label="Welcome Channel ID">
          <TextInput value={cfg.channelId} onChange={v => set('channelId', v)} placeholder="Channel ID…" />
        </Field>
        <Field label="Ping on Welcome">
          <Toggle value={cfg.welcomePing} onChange={v => set('welcomePing', v)} label="Mention the user in the welcome message" />
        </Field>
        <Field label="Welcome Message" hint="Use {user} for mention, {server} for server name, {count} for member count">
          <textarea
            value={cfg.welcomeMessage ?? ''}
            onChange={e => set('welcomeMessage', e.target.value)}
            placeholder="Welcome {user} to {server}!"
            rows={3}
            className="w-full bg-[#0f1117] border border-[#2a2d3e] text-gray-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500 placeholder-gray-600 resize-none"
          />
        </Field>
        <Field label="Welcome Image URL" hint="Image shown in the welcome embed">
          <TextInput value={cfg.welcomeImage} onChange={v => set('welcomeImage', v)} placeholder="https://…" />
        </Field>
      </SectionCard>

      <SectionCard title="Welcome Embed" description="Customise the embed sent on join.">
        <Field label="Embed Title">
          <TextInput value={embed.title} onChange={v => setEmbed('title', v)} placeholder="Welcome!" />
        </Field>
        <Field label="Embed Description">
          <textarea
            value={embed.description ?? ''}
            onChange={e => setEmbed('description', e.target.value)}
            placeholder="We're glad you're here, {user}!"
            rows={3}
            className="w-full bg-[#0f1117] border border-[#2a2d3e] text-gray-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500 placeholder-gray-600 resize-none"
          />
        </Field>
        <Field label="Embed Color">
          <div className="flex items-center gap-3">
            <input type="color" value={embed.color || '#7c6cf0'} onChange={e => setEmbed('color', e.target.value)} className="w-10 h-9 rounded cursor-pointer border-0 bg-transparent" />
            <TextInput value={embed.color} onChange={v => setEmbed('color', v)} placeholder="#7c6cf0" />
          </div>
        </Field>
        <Field label="Show Thumbnail">
          <Toggle value={embed.thumbnail} onChange={v => setEmbed('thumbnail', v)} label="Show user avatar as thumbnail" />
        </Field>
        <Field label="Embed Footer">
          <TextInput value={embed.footer} onChange={v => setEmbed('footer', v)} placeholder="Footer text…" />
        </Field>
      </SectionCard>

      <SectionCard title="Goodbye Messages" description="Message sent when a member leaves.">
        <Field label="Enable Goodbye">
          <Toggle value={cfg.goodbyeEnabled} onChange={v => set('goodbyeEnabled', v)} label="Send a message when members leave" />
        </Field>
        <Field label="Goodbye Channel ID">
          <TextInput value={cfg.goodbyeChannelId} onChange={v => set('goodbyeChannelId', v)} placeholder="Channel ID…" />
        </Field>
        <Field label="Leave Message" hint="Use {user.tag} for username#discriminator">
          <textarea
            value={cfg.leaveMessage ?? ''}
            onChange={e => set('leaveMessage', e.target.value)}
            placeholder="{user.tag} has left the server."
            rows={2}
            className="w-full bg-[#0f1117] border border-[#2a2d3e] text-gray-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500 placeholder-gray-600 resize-none"
          />
        </Field>
        <Field label="Leave Embed Color">
          <div className="flex items-center gap-3">
            <input type="color" value={leaveEmbed.color || '#ef4444'} onChange={e => setLeaveEmbed('color', e.target.value)} className="w-10 h-9 rounded cursor-pointer border-0 bg-transparent" />
            <TextInput value={leaveEmbed.color} onChange={v => setLeaveEmbed('color', v)} placeholder="#ef4444" />
          </div>
        </Field>
      </SectionCard>

      <SectionCard title="DM on Join" description="Send the new member a DM when they join.">
        <Field label="DM Message" hint="Sent directly to the new member">
          <textarea
            value={cfg.dmMessage ?? ''}
            onChange={e => set('dmMessage', e.target.value)}
            placeholder="Welcome to the server! Read our rules in #rules."
            rows={3}
            className="w-full bg-[#0f1117] border border-[#2a2d3e] text-gray-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500 placeholder-gray-600 resize-none"
          />
        </Field>
      </SectionCard>

      <SectionCard title="Auto Roles" description="Roles automatically assigned when a member joins.">
        <AutoRoles roleIds={cfg.roleIds || []} onChange={v => set('roleIds', v)} />
        <Field label="Auto-Role Delay (ms)" hint="Delay before assigning roles (0 = immediate)">
          <input
            type="number"
            min="0"
            value={cfg.autoRoleDelay ?? 0}
            onChange={e => set('autoRoleDelay', Number(e.target.value))}
            className="w-40 bg-[#0f1117] border border-[#2a2d3e] text-gray-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </Field>
      </SectionCard>

      <div className="flex justify-end">
        <SaveButton onClick={handleSave} saving={saving} saved={saved} />
      </div>
    </div>
  )
}

function AutoRoles({ roleIds, onChange }) {
  function update(idx, val) {
    const next = [...roleIds]
    next[idx] = val
    onChange(next)
  }
  function add() { onChange([...roleIds, '']) }
  function remove(idx) { onChange(roleIds.filter((_, i) => i !== idx)) }

  return (
    <div className="space-y-2">
      {roleIds.map((id, i) => (
        <div key={`role-${i}-${id}`} className="flex items-center gap-2">
          <input
            value={id}
            onChange={e => update(i, e.target.value)}
            placeholder="Role ID…"
            className="flex-1 bg-[#0f1117] border border-[#2a2d3e] text-gray-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <button onClick={() => remove(i)} className="text-red-400 hover:text-red-300 px-2 text-sm">✕</button>
        </div>
      ))}
      <button onClick={add} className="text-brand-400 hover:text-brand-300 text-sm font-medium">+ Add Role</button>
    </div>
  )
}

function Skeleton() {
  return <div className="max-w-2xl space-y-4 animate-pulse">{[1,2,3,4].map(i => <div key={i} className="bg-[#1a1d27] border border-[#1e2130] rounded-xl h-40" />)}</div>
}

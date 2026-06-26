import { useState, useEffect } from 'react'
import { useGuild } from '../context/GuildContext.jsx'
import { SectionCard, SaveButton } from '../components/SectionCard.jsx'

const DEFAULT_PACK = {
  id: '',
  name: '',
  emoji: '📦',
  description: '',
  price: 100,
  rewards: [
    { type: 'coins', amount: 50, chance: 60, label: '50 coins' },
    { type: 'coins', amount: 150, chance: 30, label: '150 coins' },
    { type: 'coins', amount: 300, chance: 10, label: '300 coins' },
  ],
}

export default function Economy() {
  const { fetchSection, saveSection, selectedGuildId } = useGuild()
  const [config, setConfig] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [editingPack, setEditingPack] = useState(null)
  const [showPackForm, setShowPackForm] = useState(false)
  const [packForm, setPackForm] = useState(DEFAULT_PACK)
  const [packError, setPackError] = useState('')

  useEffect(() => {
    if (!selectedGuildId) return
    setLoading(true)
    fetchSection('economy')
      .then(data => setConfig(data && Object.keys(data).length > 0 ? data : getDefaults()))
      .catch(() => setConfig(getDefaults()))
      .finally(() => setLoading(false))
    setSaved(false)
  }, [selectedGuildId])

  function getDefaults() {
    return {
      enabled: true,
      currencyName: 'Coins',
      currencyEmoji: '🪙',
      dailyAmount: 100,
      dailyStreakBonus: 10,
      packs: [],
    }
  }

  function patch(key, value) {
    setConfig(c => ({ ...c, [key]: value }))
    setSaved(false)
  }

  async function handleSave() {
    setSaving(true)
    try {
      await saveSection('economy', config)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e) {
      alert('Save failed: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  function openAddPack() {
    setPackForm({ ...DEFAULT_PACK })
    setEditingPack(null)
    setPackError('')
    setShowPackForm(true)
  }

  function openEditPack(pack, idx) {
    setPackForm({ ...pack })
    setEditingPack(idx)
    setPackError('')
    setShowPackForm(true)
  }

  function removePack(idx) {
    const packs = [...(config.packs || [])]
    packs.splice(idx, 1)
    patch('packs', packs)
  }

  function validatePack() {
    if (!packForm.name.trim()) return 'Pack name is required.'
    if (!packForm.emoji.trim()) return 'Emoji is required.'
    if (!packForm.price || packForm.price < 1) return 'Price must be at least 1.'
    if (!packForm.description.trim()) return 'Description is required.'
    const total = (packForm.rewards || []).reduce((s, r) => s + (parseFloat(r.chance) || 0), 0)
    if (Math.abs(total - 100) > 1) return `Reward chances must total 100%. Currently: ${total.toFixed(1)}%`
    return ''
  }

  function savePack() {
    const err = validatePack()
    if (err) { setPackError(err); return }
    const packs = [...(config.packs || [])]
    const id = packForm.name.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 20)
    const newPack = { ...packForm, id }
    if (editingPack !== null) {
      packs[editingPack] = newPack
    } else {
      packs.push(newPack)
    }
    patch('packs', packs)
    setShowPackForm(false)
    setSaved(false)
  }

  function updateReward(idx, key, value) {
    const rewards = [...(packForm.rewards || [])]
    rewards[idx] = { ...rewards[idx], [key]: key === 'chance' || key === 'amount' ? parseFloat(value) || 0 : value }
    if (key === 'amount') rewards[idx].label = `${value} coins`
    setPackForm(f => ({ ...f, rewards }))
  }

  function addReward() {
    setPackForm(f => ({
      ...f,
      rewards: [...(f.rewards || []), { type: 'coins', amount: 0, chance: 0, label: '0 coins' }],
    }))
  }

  function removeReward(idx) {
    const rewards = [...(packForm.rewards || [])]
    rewards.splice(idx, 1)
    setPackForm(f => ({ ...f, rewards }))
  }

  if (!selectedGuildId) return <div className="text-gray-500 text-sm">No server selected.</div>
  if (loading) return <Skeleton />
  if (!config) return null

  const totalChance = (packForm.rewards || []).reduce((s, r) => s + (parseFloat(r.chance) || 0), 0)

  return (
    <div className="max-w-2xl space-y-6">

      <SectionCard title="Economy System">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-gray-300 text-sm font-medium">Enable Economy</span>
            <button
              onClick={() => patch('enabled', !config.enabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${config.enabled ? 'bg-brand-600' : 'bg-gray-700'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${config.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-gray-400 text-xs mb-1">Currency Name</label>
              <input
                value={config.currencyName || ''}
                onChange={e => patch('currencyName', e.target.value)}
                className="w-full bg-[#0f1117] border border-[#2a2d3e] text-gray-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="Coins"
                maxLength={20}
              />
            </div>
            <div>
              <label className="block text-gray-400 text-xs mb-1">Currency Emoji</label>
              <input
                value={config.currencyEmoji || ''}
                onChange={e => patch('currencyEmoji', e.target.value)}
                className="w-full bg-[#0f1117] border border-[#2a2d3e] text-gray-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="🪙"
                maxLength={8}
              />
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Daily Reward">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-gray-400 text-xs mb-1">Base Daily Amount</label>
            <input
              type="number"
              value={config.dailyAmount || 100}
              onChange={e => patch('dailyAmount', parseInt(e.target.value) || 0)}
              className="w-full bg-[#0f1117] border border-[#2a2d3e] text-gray-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
              min={1}
              max={1000000}
            />
          </div>
          <div>
            <label className="block text-gray-400 text-xs mb-1">Streak Bonus Per Day</label>
            <input
              type="number"
              value={config.dailyStreakBonus ?? 10}
              onChange={e => patch('dailyStreakBonus', parseInt(e.target.value) || 0)}
              className="w-full bg-[#0f1117] border border-[#2a2d3e] text-gray-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
              min={0}
              max={10000}
            />
          </div>
        </div>
        <p className="text-gray-600 text-xs mt-2">Users earn +{config.dailyStreakBonus ?? 10} bonus {config.currencyName || 'coins'} for each consecutive daily claim (up to +{Math.min(30, 30) * (config.dailyStreakBonus ?? 10)} at 30-day streak).</p>
      </SectionCard>

      <SectionCard title={`Pack Shop (${(config.packs || []).length} packs)`}>
        <div className="space-y-3">
          {(config.packs || []).length === 0 && (
            <p className="text-gray-500 text-sm text-center py-4">No packs configured. Add one below!</p>
          )}
          {(config.packs || []).map((pack, idx) => (
            <div key={idx} className="bg-[#0f1117] rounded-lg p-3 border border-[#1e2130]">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-gray-200 text-sm font-medium">{pack.emoji} {pack.name} — {pack.price?.toLocaleString()} {config.currencyEmoji}</p>
                  <p className="text-gray-500 text-xs mt-0.5">{pack.description}</p>
                  <div className="mt-1 space-y-0.5">
                    {(pack.rewards || []).map((r, ri) => (
                      <p key={ri} className="text-gray-600 text-xs">• {r.label} — {r.chance}%</p>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2 ml-2 shrink-0">
                  <button
                    onClick={() => openEditPack(pack, idx)}
                    className="text-xs text-brand-400 hover:text-brand-300 font-medium"
                  >Edit</button>
                  <button
                    onClick={() => removePack(idx)}
                    className="text-xs text-red-400 hover:text-red-300 font-medium"
                  >Remove</button>
                </div>
              </div>
            </div>
          ))}

          <button
            onClick={openAddPack}
            className="w-full py-2 text-sm text-brand-400 hover:text-brand-300 border border-dashed border-[#2a2d3e] hover:border-brand-600 rounded-lg transition-colors"
          >
            + Add Pack
          </button>
        </div>
      </SectionCard>

      {showPackForm && (
        <SectionCard title={editingPack !== null ? 'Edit Pack' : 'New Pack'}>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="block text-gray-400 text-xs mb-1">Pack Name</label>
                <input
                  value={packForm.name}
                  onChange={e => setPackForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full bg-[#0f1117] border border-[#2a2d3e] text-gray-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="Legendary Pack"
                  maxLength={32}
                />
              </div>
              <div>
                <label className="block text-gray-400 text-xs mb-1">Emoji</label>
                <input
                  value={packForm.emoji}
                  onChange={e => setPackForm(f => ({ ...f, emoji: e.target.value }))}
                  className="w-full bg-[#0f1117] border border-[#2a2d3e] text-gray-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="🌟"
                  maxLength={8}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-gray-400 text-xs mb-1">Price ({config.currencyEmoji})</label>
                <input
                  type="number"
                  value={packForm.price}
                  onChange={e => setPackForm(f => ({ ...f, price: parseInt(e.target.value) || 0 }))}
                  className="w-full bg-[#0f1117] border border-[#2a2d3e] text-gray-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  min={1}
                />
              </div>
              <div>
                <label className="block text-gray-400 text-xs mb-1">Description</label>
                <input
                  value={packForm.description}
                  onChange={e => setPackForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full bg-[#0f1117] border border-[#2a2d3e] text-gray-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="A powerful pack with rare rewards"
                  maxLength={100}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-gray-400 text-xs">Rewards <span className={`ml-1 ${Math.abs(totalChance - 100) > 1 ? 'text-red-400' : 'text-green-400'}`}>({totalChance.toFixed(1)}% total — must be 100%)</span></label>
                <button onClick={addReward} className="text-xs text-brand-400 hover:text-brand-300">+ Add Reward</button>
              </div>
              <div className="space-y-2">
                {(packForm.rewards || []).map((r, ri) => (
                  <div key={ri} className="flex gap-2 items-center">
                    <input
                      type="number"
                      value={r.amount}
                      onChange={e => updateReward(ri, 'amount', e.target.value)}
                      className="w-24 bg-[#0f1117] border border-[#2a2d3e] text-gray-200 text-sm rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-500"
                      placeholder="Amount"
                      min={0}
                    />
                    <span className="text-gray-600 text-xs">coins</span>
                    <input
                      type="number"
                      value={r.chance}
                      onChange={e => updateReward(ri, 'chance', e.target.value)}
                      className="w-20 bg-[#0f1117] border border-[#2a2d3e] text-gray-200 text-sm rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-500"
                      placeholder="Chance"
                      min={0}
                      max={100}
                    />
                    <span className="text-gray-600 text-xs">%</span>
                    <button onClick={() => removeReward(ri)} className="text-red-500 hover:text-red-400 text-xs ml-auto">✕</button>
                  </div>
                ))}
              </div>
            </div>

            {packError && <p className="text-red-400 text-xs">{packError}</p>}

            <div className="flex gap-2 pt-1">
              <button
                onClick={savePack}
                className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white text-sm rounded-lg font-medium transition-colors"
              >
                {editingPack !== null ? 'Save Changes' : 'Add Pack'}
              </button>
              <button
                onClick={() => setShowPackForm(false)}
                className="px-4 py-2 bg-[#1a1d27] hover:bg-[#22253a] text-gray-300 text-sm rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </SectionCard>
      )}

      <div className="flex justify-end">
        <SaveButton onClick={handleSave} saving={saving} saved={saved} />
      </div>
    </div>
  )
}

function Skeleton() {
  return (
    <div className="max-w-2xl space-y-4 animate-pulse">
      {[1, 2, 3].map(i => <div key={i} className="bg-[#1a1d27] border border-[#1e2130] rounded-xl h-40" />)}
    </div>
  )
}

import { createContext, useContext, useState, useEffect } from 'react'

const GuildContext = createContext(null)

export function GuildProvider({ children }) {
  const [guilds, setGuilds] = useState([])
  const [selectedGuildId, setSelectedGuildId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch('/api/guilds')
      .then(async r => {
        const body = await r.json()
        if (!r.ok) throw new Error(body.detail || body.error || `HTTP ${r.status}`)
        return body
      })
      .then(data => {
        const list = Array.isArray(data) ? data : []
        setGuilds(list)
        if (list.length > 0) setSelectedGuildId(list[0].id)
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  async function fetchSection(section) {
    if (!selectedGuildId) return {}
    const url = section === 'config'
      ? `/api/guilds/${selectedGuildId}/config`
      : `/api/guilds/${selectedGuildId}/${section}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Failed to load ${section}`)
    return res.json()
  }

  async function saveSection(section, data) {
    if (!selectedGuildId) throw new Error('No guild selected')
    const url = section === 'config'
      ? `/api/guilds/${selectedGuildId}/config`
      : `/api/guilds/${selectedGuildId}/${section}`
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    if (!res.ok) throw new Error(`Failed to save ${section}`)
    return res.json()
  }

  return (
    <GuildContext.Provider value={{ guilds, selectedGuildId, setSelectedGuildId, loading, error, fetchSection, saveSection }}>
      {children}
    </GuildContext.Provider>
  )
}

export function useGuild() {
  return useContext(GuildContext)
}

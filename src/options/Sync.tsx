import { useEffect, useState } from 'react'
import { DEFAULT_SYNC, SYNC_KEY, cleanSync, type SyncSettings } from '../lib/sync'

export function Sync() {
  const [settings, setSettings] = useState<SyncSettings>(DEFAULT_SYNC)
  const [message, setMessage] = useState('')

  useEffect(() => {
    void chrome.storage.local.get(SYNC_KEY).then((stored) => {
      setSettings(cleanSync(stored[SYNC_KEY] as Partial<SyncSettings> | undefined))
    })
  }, [])

  async function save(next: SyncSettings) {
    const cleaned = cleanSync(next)
    if (cleaned.notion) {
      const granted = await chrome.permissions.request({ origins: ['https://api.notion.com/*'] }).catch(() => false)
      if (!granted) {
        setMessage('Chrome needs permission to reach api.notion.com. Notion stays off.')
        setSettings({ ...cleaned, notion: false })
        await chrome.storage.local.set({ [SYNC_KEY]: { ...cleaned, notion: false } })
        return
      }
    }
    await chrome.storage.local.set({ [SYNC_KEY]: cleaned })
    setSettings(cleaned)
    setMessage('Saved on this browser. Sync stays off until you turn it on.')
  }

  return (
    <section className="folders" id="sync">
      <h2>Sync</h2>
      <p className="meta">Optional. Off by default. Batch summary rows can go to a Google Sheet or a Notion database you choose. Nothing is sent until a batch finishes with that option on.</p>
      <label className="row">
        <input
          type="checkbox"
          checked={settings.sheets}
          onChange={(event) => setSettings({ ...settings, sheets: event.target.checked })}
        />
        Google Sheet, using the Google account already signed in to this browser
      </label>
      <label className="row">
        <input
          type="checkbox"
          checked={settings.notion}
          onChange={(event) => setSettings({ ...settings, notion: event.target.checked })}
        />
        Notion database
      </label>
      <input
        type="password"
        placeholder="Notion integration token"
        autoComplete="off"
        value={settings.notionToken}
        onChange={(event) => setSettings({ ...settings, notionToken: event.target.value })}
      />
      <input
        placeholder="Notion database URL or ID"
        value={settings.notionDatabaseId}
        onChange={(event) => setSettings({ ...settings, notionDatabaseId: event.target.value })}
      />
      <p className="meta">The token stays in this browser. Share the database with your integration, and add properties named Median views, Reels loaded, Reels at 3x, Followers, and Top reel if you want those columns filled. The title property receives the account name.</p>
      <button type="button" onClick={() => void save(settings)}>Save sync settings</button>
      {message && <p className="meta">{message}</p>}
    </section>
  )
}

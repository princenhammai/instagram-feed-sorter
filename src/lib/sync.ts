export const SYNC_KEY = 'ifs-sync'
export const NOTION_VERSION = '2022-06-28'

export interface SyncSettings {
  sheets: boolean
  notion: boolean
  notionToken: string
  notionDatabaseId: string
}

export const DEFAULT_SYNC: SyncSettings = {
  sheets: false,
  notion: false,
  notionToken: '',
  notionDatabaseId: '',
}

export interface SummarySyncRow {
  account: string
  loaded: number
  medianViews: number | null
  topReel: string
  topViews: number | null
  atLeast3x: number
  followers: number | null
  note?: string
  grade?: string
}

export interface NotionProperty {
  type: string
  name: string
}

export function cleanSync(value: Partial<SyncSettings> | null | undefined): SyncSettings {
  return {
    sheets: Boolean(value?.sheets),
    notion: Boolean(value?.notion),
    notionToken: typeof value?.notionToken === 'string' ? value.notionToken.trim() : '',
    notionDatabaseId: normalizeDatabaseId(value?.notionDatabaseId ?? ''),
  }
}

export function normalizeDatabaseId(value: string): string {
  const trimmed = value.trim()
  const fromUrl = trimmed.match(/([0-9a-f]{32})/i)
  if (fromUrl) return fromUrl[1].toLowerCase()
  return trimmed.replace(/-/g, '')
}

export function notionReady(settings: SyncSettings): boolean {
  return settings.notion && settings.notionToken.length > 0 && settings.notionDatabaseId.length >= 32
}

function numberProperty(value: number | null): { number: number | null } {
  return { number: value }
}

function textProperty(value: string, type: string): Record<string, unknown> | null {
  if (type === 'url') return value ? { url: value } : { url: null }
  if (type === 'rich_text') {
    return { rich_text: value ? [{ type: 'text', text: { content: value.slice(0, 2000) } }] : [] }
  }
  if (type === 'title') return { title: [{ type: 'text', text: { content: value.slice(0, 2000) } }] }
  return null
}

function matchName(name: string, pattern: RegExp): boolean {
  return pattern.test(name.trim().toLowerCase())
}

export function notionProperties(schema: NotionProperty[], row: SummarySyncRow): Record<string, unknown> {
  const properties: Record<string, unknown> = {}
  let titled = false
  for (const property of schema) {
    const name = property.name
    if (property.type === 'title' && !titled) {
      properties[name] = textProperty(row.account, 'title')
      titled = true
      continue
    }
    if (property.type === 'number' && matchName(name, /median/)) {
      properties[name] = numberProperty(row.medianViews)
      continue
    }
    if (property.type === 'number' && matchName(name, /loaded|reels loaded/)) {
      properties[name] = numberProperty(row.loaded)
      continue
    }
    if (property.type === 'number' && matchName(name, /3x|3×|three/)) {
      properties[name] = numberProperty(row.atLeast3x)
      continue
    }
    if (property.type === 'number' && matchName(name, /follower/)) {
      properties[name] = numberProperty(row.followers)
      continue
    }
    if (property.type === 'number' && matchName(name, /top views/)) {
      properties[name] = numberProperty(row.topViews)
      continue
    }
    if ((property.type === 'url' || property.type === 'rich_text') && matchName(name, /top reel|permalink|url/)) {
      const encoded = textProperty(row.topReel, property.type)
      if (encoded) properties[name] = encoded
      continue
    }
    if (property.type === 'rich_text' && matchName(name, /source|provenance/)) {
      const encoded = textProperty(row.note || '', 'rich_text')
      if (encoded) properties[name] = encoded
      continue
    }
    if (property.type === 'rich_text' && matchName(name, /^grade$/)) {
      const encoded = textProperty(row.grade || '', 'rich_text')
      if (encoded) properties[name] = encoded
    }
  }
  if (!titled) {
    const fallback = schema.find((property) => property.type === 'title')
    if (fallback) properties[fallback.name] = textProperty(row.account, 'title')
  }
  return properties
}

export function notionPageBody(databaseId: string, properties: Record<string, unknown>): Record<string, unknown> {
  return {
    parent: { database_id: databaseId },
    properties,
  }
}

export function notionSchema(payload: unknown): NotionProperty[] {
  if (!payload || typeof payload !== 'object') return []
  const properties = (payload as { properties?: Record<string, { type?: string }> }).properties
  if (!properties) return []
  return Object.entries(properties).map(([name, value]) => ({ name, type: value?.type || '' }))
}

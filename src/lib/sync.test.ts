import { describe, expect, it } from 'vitest'
import { cleanSync, normalizeDatabaseId, notionPageBody, notionProperties, notionReady, notionSchema } from './sync'

describe('sync settings', () => {
  it('stays off until a token and database are saved', () => {
    expect(notionReady(cleanSync({}))).toBe(false)
    const settings = cleanSync({
      notion: true,
      notionToken: ' secret ',
      notionDatabaseId: 'https://www.notion.so/workspace/Batch-0123456789abcdef0123456789abcdef?v=1',
    })
    expect(settings.notionToken).toBe('secret')
    expect(normalizeDatabaseId(settings.notionDatabaseId)).toBe('0123456789abcdef0123456789abcdef')
    expect(notionReady(settings)).toBe(true)
    expect(settings.sheets).toBe(false)
  })

  it('maps a summary row onto matching Notion properties', () => {
    const schema = notionSchema({
      properties: {
        Name: { type: 'title' },
        'Median views': { type: 'number' },
        'Reels at 3x': { type: 'number' },
        'Top reel': { type: 'url' },
      },
    })
    const properties = notionProperties(schema, {
      account: 'ada',
      loaded: 12,
      medianViews: 300,
      topReel: 'https://www.instagram.com/reel/c/',
      topViews: 900,
      atLeast3x: 1,
      followers: 10,
    })
    expect(properties.Name).toMatchObject({ title: [{ text: { content: 'ada' } }] })
    expect(properties['Median views']).toEqual({ number: 300 })
    expect(properties['Reels at 3x']).toEqual({ number: 1 })
    const withProvenance = notionProperties(
      notionSchema({ properties: { Name: { type: 'title' }, Grade: { type: 'rich_text' }, Provenance: { type: 'rich_text' } } }),
      {
        account: 'cara',
        loaded: 5,
        medianViews: 12000,
        topReel: 'https://www.instagram.com/cara/',
        topViews: null,
        atLeast3x: 2,
        followers: 20000,
        grade: 'STRONG',
        note: 'followed by ada, bob',
      },
    )
    expect(withProvenance.Grade).toMatchObject({ rich_text: [{ text: { content: 'STRONG' } }] })
    expect(withProvenance.Provenance).toMatchObject({ rich_text: [{ text: { content: 'followed by ada, bob' } }] })
    expect(notionPageBody('abc', properties).parent).toEqual({ database_id: 'abc' })
  })
})

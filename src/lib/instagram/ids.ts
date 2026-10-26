const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
const EPOCH = 1314220021721n

export function shortcodeToId(code: string): string {
  let value = 0n
  for (const char of code) {
    const index = ALPHABET.indexOf(char)
    if (index < 0) throw new Error('That post link is not one this extension understands.')
    value = value * 64n + BigInt(index)
  }
  return value.toString(10)
}

export function instagramIdToMs(id: string): number {
  const numeric = id.split('_')[0] ?? ''
  if (!/^\d+$/.test(numeric)) return 0
  return Number((BigInt(numeric) >> 23n) + EPOCH)
}

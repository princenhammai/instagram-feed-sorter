import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'

function chunk(tag, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const type = Buffer.from(tag)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([type, data])) >>> 0)
  return Buffer.concat([length, type, data, crc])
}

const table = new Uint32Array(256)
for (let n = 0; n < 256; n += 1) {
  let c = n
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  table[n] = c
}
function crc32(buf) {
  let c = 0xffffffff
  for (const byte of buf) c = table[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function png(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 4 + 1)
    raw[row] = 0
    for (let x = 0; x < size; x += 1) {
      const px = row + 1 + x * 4
      const inset = size * 0.12
      const radius = size * 0.22
      const inside = rounded(x, y, inset, size - inset, radius)
      const bars = [0.42, 0.68, 1]
      let bar = false
      bars.forEach((height, index) => {
        const gap = size * 0.08
        const width = size * 0.16
        const left = size * 0.22 + index * (width + gap)
        const top = size * (0.78 - height * 0.5)
        if (x >= left && x <= left + width && y >= top && y <= size * 0.78) bar = true
      })
      const color = !inside ? [0, 0, 0, 0] : bar ? [224, 161, 90, 255] : [22, 24, 29, 255]
      raw[px] = color[0]
      raw[px + 1] = color[1]
      raw[px + 2] = color[2]
      raw[px + 3] = color[3]
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function rounded(x, y, left, right, radius) {
  const top = left
  const bottom = right
  if (x < left || x >= right || y < top || y >= bottom) return false
  const corners = [
    [left + radius, top + radius],
    [right - radius, top + radius],
    [left + radius, bottom - radius],
    [right - radius, bottom - radius],
  ]
  const inCornerBox =
    (x < left + radius && y < top + radius) ||
    (x >= right - radius && y < top + radius) ||
    (x < left + radius && y >= bottom - radius) ||
    (x >= right - radius && y >= bottom - radius)
  if (!inCornerBox) return true
  return corners.some(([cx, cy]) => (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2)
}

mkdirSync(new URL('../public/icons/', import.meta.url), { recursive: true })
for (const size of [16, 32, 48, 128]) {
  writeFileSync(new URL(`../public/icons/icon${size}.png`, import.meta.url), png(size))
}

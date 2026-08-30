/** Everything on the staff that is not a notehead: clefs, accidentals, barlines, rests. */

import type { Blob } from './components'
import type { Staff } from './staves'
import type { ClefType } from '../lib/types'

export type AccidentalKind = 'sharp' | 'flat' | 'natural'

export interface RestHit {
  cx: number
  cy: number
  /** Length in quarter-note beats. */
  base: number
}

/** Horizontal extent of the ink in a band of rows: how wide it is, and where it sits. */
function band(blob: Blob, from: number, to: number): { width: number; centre: number } {
  const y0 = Math.max(0, Math.floor(from))
  const y1 = Math.min(blob.height, Math.ceil(to))
  let left = blob.width
  let right = -1
  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < blob.width; x++) {
      if (!blob.mask.data[y * blob.width + x]) continue
      if (x < left) left = x
      if (x > right) right = x
    }
  }
  if (right < left) return { width: 0, centre: 0.5 }
  return {
    width: (right - left + 1) / blob.width,
    centre: (left + right) / 2 / Math.max(1, blob.width - 1),
  }
}

/**
 * Which clef a staff carries. A treble clef is unmistakable by size — it overflows
 * the staff top and bottom — while a bass clef occupies only the upper half. When
 * neither shape shows up we fall back on grand-staff convention.
 */
export function detectClef(staff: Staff, blobs: Blob[], S: number): { clef: ClefType; headerEnd: number } {
  const zone = staff.left + S * 4.5
  // The blob must sit *on* this staff: on a grand staff the other clef is at the
  // same x, and it is taller, so filtering by x alone hands back the wrong one.
  const candidates = blobs
    .filter((b) => {
      if (b.x0 < staff.left - S || b.x0 >= zone || b.height <= S * 1.8) return false
      const overlap = Math.min(b.y1, staff.bottom) - Math.max(b.y0, staff.top)
      return overlap > S * 1.4
    })
    .sort((a, b) => a.x0 - b.x0)

  const fallback: ClefType = staff.indexInSystem === 0 ? 'treble' : 'bass'
  if (candidates.length === 0) return { clef: fallback, headerEnd: staff.left + S }

  const clefBlob = candidates.reduce((a, c) => (c.height > a.height ? c : a))
  let clef: ClefType = fallback
  if (clefBlob.height > S * 5) clef = 'treble'
  else if (clefBlob.height < S * 4.4 && clefBlob.y0 < staff.top + S * 1.5) clef = 'bass'

  // The header runs from the clef through any key and time signature: keep absorbing
  // blobs while they stay tightly packed, then stop well short of the first bar.
  let headerEnd = clefBlob.x1
  const limit = staff.left + (staff.right - staff.left) * 0.26
  const chain = blobs
    .filter((b) => b.x0 > clefBlob.x1 && b.x0 < limit)
    .sort((a, b) => a.x0 - b.x0)
  for (const b of chain) {
    if (b.x0 - headerEnd > S * 1.1) break
    if (b.height < S * 1.2) continue
    headerEnd = Math.max(headerEnd, b.x1)
  }
  return { clef, headerEnd: Math.min(headerEnd + S * 0.3, limit) }
}

/**
 * Tell a sharp, a flat and a natural apart by their silhouette at top and bottom.
 *
 * A sharp's two verticals both run its full height, so it is the only one of the three
 * that is wide at *both* ends. A natural's bars are staggered and a flat is a stem
 * above a bowl that closes back onto it, so both taper to a single stroke top and
 * bottom — but on opposite sides: the flat stands on its stem at the left, the natural
 * on its lower bar at the right. Which side the foot is on is what separates them;
 * width alone does not, because a natural's lower crossbar is as wide as a flat's bowl.
 *
 * The bands are kept narrow. A natural's second vertical starts about a fifth of the
 * way down, and a wider top band catches it and reads the glyph as a sharp.
 */
export function classifyAccidental(blob: Blob): AccidentalKind | null {
  const aspect = blob.width / blob.height
  if (aspect > 0.75 || aspect < 0.12) return null

  const h = blob.height
  const top = band(blob, 0, h * 0.14)
  const foot = band(blob, h * 0.86, h)
  if (top.width > 0.7 && foot.width > 0.7) return 'sharp'
  return foot.centre < 0.5 ? 'flat' : 'natural'
}

/** An accidental applying to a head sits immediately to its left, vertically centred on it. */
export function accidentalFor(
  blobs: Blob[],
  cx: number,
  cy: number,
  S: number,
): AccidentalKind | null {
  let best: { kind: AccidentalKind; gap: number } | null = null
  for (const blob of blobs) {
    const gap = cx - blob.x1
    if (gap < S * 0.1 || gap > S * 1.9) continue
    if (blob.height < S * 1.2 || blob.height > S * 3.2) continue
    if (blob.width > S * 1.05) continue // a notehead with its stem, not an accidental
    const blobCy = (blob.y0 + blob.y1) / 2
    if (Math.abs(blobCy - cy) > S * 1.2) continue
    const kind = classifyAccidental(blob)
    if (!kind) continue
    if (!best || gap < best.gap) best = { kind, gap }
  }
  return best?.kind ?? null
}

/** Barlines: tall, thin and spanning the staff. They are the pipeline's sync points. */
export function detectBarlines(staff: Staff, blobs: Blob[], S: number): number[] {
  const staffHeight = staff.bottom - staff.top
  const xs: number[] = []
  for (const blob of blobs) {
    if (blob.width > S * 0.5) continue
    if (blob.height < staffHeight * 0.82) continue
    if (blob.y0 > staff.top + S || blob.y1 < staff.bottom - S) continue
    if (blob.area / (blob.width * blob.height) < 0.6) continue
    xs.push((blob.x0 + blob.x1) / 2)
  }
  xs.sort((a, b) => a - b)

  // Double barlines and repeat marks come through as two or three close verticals.
  const merged: number[] = []
  for (const x of xs) {
    if (merged.length && x - merged[merged.length - 1] < S * 1.2) continue
    merged.push(x)
  }
  return merged
}

/**
 * Rests, classified by size and by where they sit relative to the staff lines.
 * They matter less for their silence than for the beats they consume: without them
 * a hand that enters late would drag the whole measure out of alignment.
 */
export function detectRests(staff: Staff, blobs: Blob[], S: number, usedBlobs: Set<number>): RestHit[] {
  const rests: RestHit[] = []
  for (const blob of blobs) {
    if (usedBlobs.has(blob.id)) continue
    const cx = (blob.x0 + blob.x1) / 2
    const cy = (blob.y0 + blob.y1) / 2
    if (cy < staff.top - S || cy > staff.bottom + S) continue

    const fill = blob.area / (blob.width * blob.height)
    const w = blob.width / S
    const h = blob.height / S

    // Whole and half rests are the same small filled bar; only their line differs.
    if (w > 0.7 && w < 2.2 && h > 0.22 && h < 0.8 && fill > 0.7) {
      const toWhole = Math.abs(cy - (staff.lines[1] + S * 0.25))
      const toHalf = Math.abs(cy - (staff.lines[2] - S * 0.25))
      rests.push({ cx, cy, base: toWhole <= toHalf ? 4 : 2 })
      continue
    }
    if (w > 0.4 && w < 1.5 && h > 1.9 && h < 3.4 && fill > 0.2 && fill < 0.7) {
      rests.push({ cx, cy, base: 1 })
      continue
    }
    if (w > 0.4 && w < 1.4 && h > 0.9 && h < 1.9 && fill > 0.3) {
      rests.push({ cx, cy, base: 0.5 })
    }
  }
  return rests.sort((a, b) => a.cx - b.cx)
}

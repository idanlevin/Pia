/** Notehead detection and the stem / beam / dot analysis that gives each head a length. */

import { type Bitmap, at } from './image'
import { type Blob, fillRatio, rectStats } from './components'

export interface NoteheadHit {
  cx: number
  cy: number
  filled: boolean
  /** Detector score, 0..1. */
  score: number
  blob: Blob
}

export interface HeadRhythm {
  /** Length in quarter-note beats, before the dot is applied. */
  base: number
  dotted: boolean
  stem: 'up' | 'down' | null
  beams: number
}

/**
 * Slide a notehead-sized window over a blob and keep the local maxima.
 *
 * The window sits a shade inside a real notehead's ellipse. Scoring the *ring*
 * between the outer and inner windows rather than the whole window means a filled
 * head and a hollow one both read near 1.0 — the hole in a half note stops being a
 * penalty — while a stem, a barline or a stray speck stays far below.
 *
 * On its own that is not enough. In a chord of stacked thirds the heads touch, and the
 * solid patch *between* two of them scores at least as well as the heads do — it has
 * no hole to dock marks for. What separates them is width: a notehead is at its widest
 * across its middle, while the junction of two heads is only the tips of two ellipses.
 * So a candidate that reads as solid has to be a notehead's width across, which also
 * rules out the other solid thing on the page, a beam, from the far side.
 */
export function findNoteheads(blob: Blob, S: number, yMin: number, yMax: number): NoteheadHit[] {
  const ow = Math.max(3, Math.round(S * 0.95))
  const oh = Math.max(2, Math.round(S * 0.68))
  const iw = Math.max(1, Math.round(S * 0.42))
  const ih = Math.max(1, Math.round(S * 0.26))

  const candidates: NoteheadHit[] = []
  const y0 = Math.max(blob.y0 + (oh >> 1), Math.round(yMin))
  const y1 = Math.min(blob.y1 - (oh >> 1), Math.round(yMax))

  for (let cy = y0; cy <= y1; cy++) {
    for (let cx = blob.x0 + (ow >> 1); cx <= blob.x1 - (ow >> 1); cx++) {
      const outer = rectStats(blob, cx, cy, ow, oh)
      if (outer.area === 0) continue
      const inner = rectStats(blob, cx, cy, iw, ih)
      const ringArea = outer.area - inner.area
      if (ringArea <= 0) continue
      const ring = (outer.sum - inner.sum) / ringArea
      if (ring < 0.72) continue
      const innerFill = inner.area === 0 ? 1 : inner.sum / inner.area
      candidates.push({ cx, cy, filled: innerFill > 0.6, score: ring, blob })
    }
  }

  candidates.sort((a, b) => b.score - a.score)
  const kept: NoteheadHit[] = []
  const dxLimit = S * 0.8
  const dyLimit = S * 0.6

  for (const c of candidates) {
    let clash = false
    for (const k of kept) {
      if (Math.abs(k.cx - c.cx) < dxLimit && Math.abs(k.cy - c.cy) < dyLimit) {
        clash = true
        break
      }
    }
    if (clash) continue
    if (c.filled ? !isNoteheadWide(c, S) : !hasClosedRim(c, S)) continue
    kept.push(c)
  }
  return kept
}

/**
 * How far solid ink runs sideways at head height, which has to be about a notehead's
 * width. Too narrow and the candidate is the junction between two stacked heads in a
 * chord; too wide and it is a beam. Only candidates that read as solid are asked —
 * a hollow head has its hole across this line and would measure nothing.
 */
function isNoteheadWide(hit: NoteheadHit, S: number): boolean {
  const band = Math.max(1, Math.round(S * 0.5))
  const limit = Math.round(S * 2.3)
  let extent = 1

  for (let d = 1; d <= limit; d++) {
    if (fillRatio(hit.blob, hit.cx + d, hit.cy, 1, band) < 0.6) break
    extent++
  }
  for (let d = 1; d <= limit; d++) {
    if (fillRatio(hit.blob, hit.cx - d, hit.cy, 1, band) < 0.6) break
    extent++
  }
  return extent >= S * 0.85 && extent <= S * 2.0
}

/**
 * A hollow head's hole is enclosed: there is ink immediately left and right of it.
 * The gap between two stacked beams reads like a hole to the window test but has no
 * such rim, which is what tells the two apart.
 */
function hasClosedRim(hit: NoteheadHit, S: number): boolean {
  const w = Math.max(1, Math.round(S * 0.14))
  const h = Math.max(1, Math.round(S * 0.26))
  const dx = S * 0.42
  return (
    fillRatio(hit.blob, hit.cx - dx, hit.cy, w, h) > 0.6 &&
    fillRatio(hit.blob, hit.cx + dx, hit.cy, w, h) > 0.6
  )
}

/** Ink count in a column over a vertical window — tolerant of the gaps left by
 *  staff-line removal in a way a contiguous run would not be. */
function columnInk(b: Bitmap, x: number, yFrom: number, yTo: number): number {
  let n = 0
  for (let y = Math.max(0, yFrom); y <= Math.min(b.height - 1, yTo); y++) {
    if (b.data[y * b.width + x]) n++
  }
  return n
}

/** Find the stem attached to a head: up stems leave from the right, down from the left. */
function findStem(
  b: Bitmap,
  hit: NoteheadHit,
  S: number,
): { x: number; tip: number; dir: 'up' | 'down' } | null {
  const reach = Math.round(S * 4)
  const needed = S * 1.9

  const scan = (dir: 'up' | 'down') => {
    const from = dir === 'up' ? Math.round(hit.cx + S * 0.25) : Math.round(hit.cx - S * 0.85)
    const to = dir === 'up' ? Math.round(hit.cx + S * 0.85) : Math.round(hit.cx - S * 0.25)
    let bestX = -1
    let bestInk = 0
    for (let x = from; x <= to; x++) {
      if (x < 0 || x >= b.width) continue
      const ink =
        dir === 'up'
          ? columnInk(b, x, hit.cy - reach, hit.cy - Math.round(S * 0.3))
          : columnInk(b, x, hit.cy + Math.round(S * 0.3), hit.cy + reach)
      if (ink > bestInk) {
        bestInk = ink
        bestX = x
      }
    }
    if (bestInk < needed || bestX < 0) return null

    // Walk to the far end of the stem, hopping gaps of up to a third of a staff space.
    let tip = hit.cy
    let gap = 0
    const step = dir === 'up' ? -1 : 1
    const maxGap = Math.max(2, Math.round(S * 0.4))
    for (let y = hit.cy; y >= 0 && y < b.height; y += step) {
      if (at(b, bestX, y)) {
        tip = y
        gap = 0
      } else if (++gap > maxGap) {
        break
      }
    }
    return { x: bestX, tip, dir }
  }

  const up = scan('up')
  const down = scan('down')
  if (up && down) {
    // Both directions look inked (a chord stem passing through). Prefer the longer.
    return Math.abs(up.tip - hit.cy) >= Math.abs(down.tip - hit.cy) ? up : down
  }
  return up ?? down
}

/** Count beams (or flag hooks) hanging off the stem tip. */
function countBeams(b: Bitmap, stemX: number, tip: number, dir: 'up' | 'down', S: number): number {
  const span = Math.round(S * 2.6)
  const yFrom = dir === 'up' ? tip - Math.round(S * 0.25) : tip - span
  const yTo = dir === 'up' ? tip + span : tip + Math.round(S * 0.25)

  const sideInk = (sign: number) => {
    let n = 0
    for (let d = Math.round(S * 0.3); d <= Math.round(S * 1.1); d++) {
      for (let y = yFrom; y <= yTo; y++) n += at(b, stemX + sign * d, y)
    }
    return n
  }
  const sign = sideInk(1) >= sideInk(-1) ? 1 : -1

  const x0 = stemX + sign * Math.round(S * 0.3)
  const x1 = stemX + sign * Math.round(S * 1.0)
  const from = Math.min(x0, x1)
  const to = Math.max(x0, x1)
  const width = to - from + 1
  const minBand = Math.max(1, Math.round(S * 0.22))

  let beams = 0
  let run = 0
  for (let y = yFrom; y <= yTo; y++) {
    let ink = 0
    for (let x = from; x <= to; x++) ink += at(b, x, y)
    if (ink >= width * 0.55) {
      run++
    } else {
      if (run >= minBand) beams++
      run = 0
    }
  }
  if (run >= minBand) beams++
  return Math.min(beams, 4)
}

/** Ink in a square window centred on a point, as a fraction of its area. */
function windowFill(b: Bitmap, cx: number, cy: number, half: number): number {
  let ink = 0
  let total = 0
  for (let yy = -half; yy <= half; yy++) {
    for (let xx = -half; xx <= half; xx++) {
      ink += at(b, cx + xx, cy + yy)
      total++
    }
  }
  return ink / total
}

/**
 * An augmentation dot sits just right of the head, on the same line or space. It has
 * to be solid *and* isolated — otherwise the next notehead along would read as one.
 */
function hasDot(b: Bitmap, hit: NoteheadHit, S: number): boolean {
  const from = Math.round(hit.cx + S * 0.7)
  const to = Math.round(hit.cx + S * 1.8)
  const half = Math.max(1, Math.round(S * 0.14))
  const around = Math.max(half + 2, Math.round(S * 0.45))
  const reach = Math.round(S * 0.62)
  for (let x = from; x <= to; x++) {
    for (let dy = -reach; dy <= reach; dy++) {
      if (windowFill(b, x, hit.cy + dy, half) < 0.75) continue
      if (windowFill(b, x, hit.cy + dy, around) < 0.5) return true
    }
  }
  return false
}

export function analyseRhythm(b: Bitmap, hit: NoteheadHit, S: number): HeadRhythm {
  const stem = findStem(b, hit, S)
  const dotted = hasDot(b, hit, S)

  if (!stem) {
    // No stem: hollow means a whole note; filled without a stem is most likely a
    // head whose stem was lost, so treat it as a quarter rather than inventing four beats.
    return { base: hit.filled ? 1 : 4, dotted, stem: null, beams: 0 }
  }
  if (!hit.filled) return { base: 2, dotted, stem: stem.dir, beams: 0 }

  const beams = countBeams(b, stem.x, stem.tip, stem.dir, S)
  const base = beams <= 0 ? 1 : 1 / Math.pow(2, Math.min(beams, 3))
  return { base, dotted, stem: stem.dir, beams }
}

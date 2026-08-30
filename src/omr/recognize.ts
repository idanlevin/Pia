/** The pipeline: a photo in, a playable Score out. */

import {
  adaptiveThreshold,
  createBitmap,
  denoise,
  deskew,
  runLengthScale,
  toGrey,
  type Bitmap,
} from './image'
import { labelComponents, type Blob } from './components'
import { detectStaves, removeStaffLines, type Staff } from './staves'
import { analyseRhythm, findNoteheads, type NoteheadHit } from './noteheads'
import { accidentalFor, detectBarlines, detectClef, detectRests } from './symbols'
import { CLEF_BOTTOM_LINE, diatonicToMidi, keyAlteration } from '../lib/music'
import type { ClefType, Detection, Note, Score } from '../lib/types'

export interface RecognizeOptions {
  maxSize?: number
  tempo?: number
  fifths?: number
  beatsPerMeasure?: number
  onProgress?: (stage: string, fraction: number) => void
}

export interface RecognizeResult {
  score: Score
  /** The straightened, downscaled page the detection boxes refer to. */
  preview: { data: Uint8ClampedArray; width: number; height: number }
}

interface Event {
  x: number
  duration: number
  /** Empty for a rest. */
  heads: { midi: number; confidence: number; cx: number; cy: number }[]
}

let nextId = 0
const uid = (prefix: string) => `${prefix}${(nextId++).toString(36)}`

/** Apply the deskew shear to the greyscale page so the overlay lines up with it. */
function shearGrey(
  grey: Uint8ClampedArray,
  width: number,
  height: number,
  degrees: number,
): Uint8ClampedArray {
  if (Math.abs(degrees) < 0.01) return grey
  const slope = Math.tan((degrees * Math.PI) / 180)
  const cx = width >> 1
  const out = new Uint8ClampedArray(width * height).fill(255)
  for (let x = 0; x < width; x++) {
    const shift = Math.round(slope * (x - cx))
    for (let y = 0; y < height; y++) {
      const ty = y - shift
      if (ty >= 0 && ty < height) out[ty * width + x] = grey[y * width + x]
    }
  }
  return out
}

/** Vertical position on the staff → diatonic step, where 0 is the bottom line. */
function stepFor(cy: number, staff: Staff): number {
  const halfSpace = (staff.bottom - staff.top) / 8
  return Math.round((staff.bottom - cy) / halfSpace)
}

function blobsForStaff(blobs: Blob[], staves: Staff[], index: number, S: number): Blob[] {
  const staff = staves[index]
  const reach = S * 4.5
  return blobs.filter((b) => {
    const cy = (b.y0 + b.y1) / 2
    const cx = (b.x0 + b.x1) / 2
    if (cx < staff.left - S * 2 || cx > staff.right + S * 2) return false
    const dist = cy < staff.top ? staff.top - cy : cy > staff.bottom ? cy - staff.bottom : 0
    if (dist > reach) return false
    // Between two staves of a grand staff, the nearer one wins.
    for (let j = 0; j < staves.length; j++) {
      if (j === index) continue
      const o = staves[j]
      const od = cy < o.top ? o.top - cy : cy > o.bottom ? cy - o.bottom : 0
      if (od < dist) return false
    }
    return true
  })
}

/** Group heads that share an onset (a chord) and interleave the rests. */
function buildEvents(
  heads: { hit: NoteheadHit; midi: number; duration: number }[],
  rests: { cx: number; base: number }[],
  S: number,
): Event[] {
  const events: Event[] = []
  const sorted = [...heads].sort((a, b) => a.hit.cx - b.hit.cx)

  let i = 0
  while (i < sorted.length) {
    const group = [sorted[i]]
    let j = i + 1
    while (j < sorted.length && sorted[j].hit.cx - sorted[i].hit.cx < S * 0.6) {
      group.push(sorted[j])
      j++
    }
    events.push({
      x: group.reduce((a, c) => a + c.hit.cx, 0) / group.length,
      duration: Math.max(...group.map((g) => g.duration)),
      heads: group.map((g) => ({
        midi: g.midi,
        confidence: g.hit.score,
        cx: g.hit.cx,
        cy: g.hit.cy,
      })),
    })
    i = j
  }

  for (const r of rests) events.push({ x: r.cx, duration: r.base, heads: [] })
  return events.sort((a, b) => a.x - b.x)
}

export function recognize(image: ImageData, options: RecognizeOptions = {}): RecognizeResult {
  const {
    maxSize = 1600,
    tempo = 84,
    fifths = 0,
    beatsPerMeasure = 4,
    onProgress = () => {},
  } = options
  const diagnostics: string[] = []

  onProgress('Reading the page', 0.05)
  const { grey, width, height } = toGrey(image, maxSize)

  onProgress('Separating ink from paper', 0.2)
  let binary: Bitmap = denoise(adaptiveThreshold(grey, width, height))
  let scale = runLengthScale(binary)

  onProgress('Straightening', 0.32)
  const skew = deskew(binary)
  binary = skew.bitmap
  scale = runLengthScale(binary)
  const S = scale.staffSpace + scale.lineThickness
  const preview = { data: rgbaFrom(shearGrey(grey, width, height, skew.degrees), width, height), width, height }
  if (Math.abs(skew.degrees) > 0.4) diagnostics.push(`Straightened by ${skew.degrees.toFixed(1)}°.`)

  onProgress('Finding the staves', 0.45)
  const { staves } = detectStaves(binary, scale.lineThickness, scale.staffSpace)

  const empty = (message: string): RecognizeResult => {
    diagnostics.push(message)
    return {
      preview,
      score: {
        id: uid('s'),
        title: 'Untitled scan',
        notes: [],
        key: { fifths },
        time: { beats: beatsPerMeasure, beatType: 4 },
        tempo,
        measures: [0],
        length: 0,
        detections: [],
        imageWidth: width,
        imageHeight: height,
        confidence: 0,
        diagnostics,
      },
    }
  }

  if (staves.length === 0) {
    return empty("No staves found. Fill the frame with the music and keep the page flat.")
  }

  onProgress('Erasing the staff lines', 0.55)
  const cleaned = removeStaffLines(binary, staves, scale.lineThickness)

  onProgress('Picking out the symbols', 0.68)
  const minArea = Math.max(4, Math.round(S * S * 0.06))
  const blobs = labelComponents(cleaned, minArea)

  onProgress('Reading the notes', 0.8)
  const notes: Note[] = []
  const detections: Detection[] = []
  const scores: number[] = []

  // Measures are numbered across the whole page, so the two hands of a system share
  // an index and stay locked together even when one of them is misread.
  const systems = [...new Set(staves.map((s) => s.system))].sort((a, b) => a - b)
  let measureBase = 0
  let totalBeats = 0

  for (const system of systems) {
    const staffIndices = staves
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => s.system === system)
      .map(({ i }) => i)

    let measuresInSystem = 1
    const perStaff = staffIndices.map((index) => {
      const staff = staves[index]
      const mine = blobsForStaff(blobs, staves, index, S)
      const { clef, headerEnd } = detectClef(staff, blobs, S)
      const barlines = detectBarlines(staff, blobs, S).filter((x) => x > headerEnd + S)
      measuresInSystem = Math.max(measuresInSystem, barlines.length + 1)

      const used = new Set<number>()
      const heads: { hit: NoteheadHit; midi: number; duration: number }[] = []
      const bottomDiatonic = CLEF_BOTTOM_LINE[clef as ClefType]

      for (const blob of mine) {
        if (blob.x1 < headerEnd) continue
        if (blob.width < S * 0.5 && blob.height > S * 3) continue // a lone stem or barline
        const hits = findNoteheads(blob, S, staff.top - S * 4.5, staff.bottom + S * 4.5)
        if (hits.length === 0) continue
        used.add(blob.id)

        for (const hit of hits) {
          if (hit.cx < headerEnd) continue
          const rhythm = analyseRhythm(cleaned, hit, S)
          const step = stepFor(hit.cy, staff)
          const diatonic = bottomDiatonic + step
          const letter = ((diatonic % 7) + 7) % 7
          const explicit = accidentalFor(mine, hit.cx, hit.cy, S)
          const alter =
            explicit === 'sharp' ? 1
            : explicit === 'flat' ? -1
            : explicit === 'natural' ? 0
            : keyAlteration(fifths, letter)
          const midi = diatonicToMidi(diatonic, alter)
          if (midi < 21 || midi > 108) continue
          heads.push({
            hit,
            midi,
            duration: rhythm.base * (rhythm.dotted ? 1.5 : 1),
          })
        }
      }

      const rests = detectRests(staff, mine, S, used).filter((r) => r.cx > headerEnd)
      return { staff, clef, headerEnd, barlines, events: buildEvents(heads, rests, S) }
    })

    for (const { staff, headerEnd, barlines, events } of perStaff) {
      const bounds = [headerEnd, ...barlines, staff.right + S]
      const hand = staff.indexInSystem === 0 ? 'right' : 'left'

      for (let m = 0; m + 1 < bounds.length; m++) {
        const measureIndex = measureBase + Math.min(m, measuresInSystem - 1)
        let time = measureIndex * beatsPerMeasure
        const inMeasure = events.filter((e) => e.x >= bounds[m] && e.x < bounds[m + 1])

        for (const event of inMeasure) {
          for (const head of event.heads) {
            notes.push({
              id: uid('n'),
              midi: head.midi,
              start: time,
              duration: event.duration,
              hand,
              confidence: head.confidence,
              measure: measureIndex,
            })
            scores.push(head.confidence)
            detections.push({
              x: head.cx - S * 0.7,
              y: head.cy - S * 0.55,
              w: S * 1.4,
              h: S * 1.1,
              noteId: notes[notes.length - 1].id,
            })
          }
          time += event.duration
        }
        totalBeats = Math.max(totalBeats, time)
      }
    }
    measureBase += measuresInSystem
  }

  const measures: number[] = []
  for (let m = 0; m < measureBase; m++) measures.push(m * beatsPerMeasure)
  if (measures.length === 0) measures.push(0)

  notes.sort((a, b) => a.start - b.start || a.midi - b.midi)
  const confidence = scores.length
    ? Math.min(1, (scores.reduce((a, c) => a + c, 0) / scores.length) * (notes.length >= 8 ? 1 : 0.7))
    : 0

  if (notes.length === 0) {
    diagnostics.push('Found staves but no notes. Try more light, or move closer.')
  } else {
    diagnostics.push(
      `${staves.length} stave${staves.length === 1 ? '' : 's'}, ${measureBase} measure${measureBase === 1 ? '' : 's'}, ${notes.length} notes.`,
    )
  }

  onProgress('Done', 1)
  return {
    preview,
    score: {
      id: uid('s'),
      title: 'Untitled scan',
      notes,
      key: { fifths },
      time: { beats: beatsPerMeasure, beatType: 4 },
      tempo,
      measures,
      length: Math.max(totalBeats, measureBase * beatsPerMeasure),
      detections,
      imageWidth: width,
      imageHeight: height,
      confidence,
      diagnostics,
    },
  }
}

function rgbaFrom(grey: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < grey.length; i++) {
    out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = grey[i]
    out[i * 4 + 3] = 255
  }
  return out
}

export { createBitmap }

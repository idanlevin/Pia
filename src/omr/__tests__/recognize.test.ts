import { describe, expect, it } from 'vitest'
import { recognize } from '../recognize'
import {
  accidental,
  barline,
  beamed,
  blank,
  chord,
  natural,
  clefMark,
  note,
  rest,
  staff,
  toImageData,
  type StaffSpec,
} from './render'
import { midiToName } from '../../lib/music'

const SPACE = 14

function page(): { canvas: ReturnType<typeof blank>; treble: StaffSpec; bass: StaffSpec } {
  const canvas = blank(1000, 460)
  const treble: StaffSpec = { top: 70, left: 60, right: 940, space: SPACE }
  const bass: StaffSpec = { top: 70 + SPACE * 9, left: 60, right: 940, space: SPACE }
  staff(canvas, treble)
  staff(canvas, bass)
  clefMark(canvas, treble, true)
  clefMark(canvas, bass, false)
  return { canvas, treble, bass }
}

describe('recognize', () => {
  it('finds both staves of a grand staff', () => {
    const { canvas, treble } = page()
    note(canvas, treble, { step: 0, x: 300, value: 1 })
    const { score } = recognize(toImageData(canvas))
    expect(score.diagnostics.join(' ')).toContain('2 staves')
  })

  it('reads pitches on the treble staff', () => {
    const { canvas, treble } = page()
    // E4 F4 G4 A4 B4 C5 — one diatonic step apart, from the bottom line up.
    const steps = [0, 1, 2, 3, 4, 5]
    steps.forEach((step, i) => note(canvas, treble, { step, x: 200 + i * 70, value: 1 }))

    const { score } = recognize(toImageData(canvas))
    const right = score.notes.filter((n) => n.hand === 'right').sort((a, b) => a.start - b.start)
    expect(right.map((n) => midiToName(n.midi))).toEqual(['E4', 'F4', 'G4', 'A4', 'B4', 'C5'])
  })

  it('reads pitches on the bass staff', () => {
    const { canvas, bass } = page()
    // G2 B2 D3 F3 — bottom line up in thirds.
    ;[0, 2, 4, 6].forEach((step, i) => note(canvas, bass, { step, x: 200 + i * 80, value: 1 }))

    const { score } = recognize(toImageData(canvas))
    const left = score.notes.filter((n) => n.hand === 'left').sort((a, b) => a.start - b.start)
    expect(left.map((n) => midiToName(n.midi))).toEqual(['G2', 'B2', 'D3', 'F3'])
  })

  it('tells whole, half, quarter and eighth notes apart', () => {
    const { canvas, treble } = page()
    const values = [4, 2, 1, 0.5]
    values.forEach((value, i) => note(canvas, treble, { step: 2, x: 200 + i * 130, value }))

    const { score } = recognize(toImageData(canvas))
    const right = score.notes.filter((n) => n.hand === 'right').sort((a, b) => a.start - b.start)
    expect(right).toHaveLength(4)
    expect(right.map((n) => n.duration)).toEqual(values)
  })

  it('lays notes out in time, one after another', () => {
    const { canvas, treble } = page()
    ;[1, 1, 2].forEach((value, i) => note(canvas, treble, { step: 2, x: 220 + i * 140, value }))

    const { score } = recognize(toImageData(canvas))
    const right = score.notes.filter((n) => n.hand === 'right').sort((a, b) => a.start - b.start)
    expect(right.map((n) => n.start)).toEqual([0, 1, 2])
  })

  it('restarts the clock at each barline so the two hands stay together', () => {
    const { canvas, treble, bass } = page()
    // Right hand plays four quarters; left hand plays one long note per measure.
    for (let m = 0; m < 2; m++) {
      for (let i = 0; i < 4; i++) {
        note(canvas, treble, { step: 4, x: 200 + m * 380 + i * 80, value: 1 })
      }
      note(canvas, bass, { step: 4, x: 240 + m * 380, value: 4 })
    }
    barline(canvas, treble, 560)
    barline(canvas, bass, 560)

    const { score } = recognize(toImageData(canvas))
    const left = score.notes.filter((n) => n.hand === 'left').sort((a, b) => a.start - b.start)
    expect(left.map((n) => n.start)).toEqual([0, 4])
    expect(score.measures).toEqual([0, 4])
  })

  it('survives a page photographed at an angle', () => {
    const { canvas, treble } = page()
    ;[0, 2, 4].forEach((step, i) => note(canvas, treble, { step, x: 250 + i * 120, value: 1 }))
    const rotated = rotate(canvas, 2.5)

    const { score } = recognize(toImageData(rotated))
    const right = score.notes.filter((n) => n.hand === 'right')
    expect(right.map((n) => midiToName(n.midi))).toEqual(['E4', 'G4', 'B4'])
  })

  it('reports no staves rather than throwing on a blank page', () => {
    const { score } = recognize(toImageData(blank(400, 300)))
    expect(score.notes).toEqual([])
    expect(score.diagnostics.join(' ')).toMatch(/No staves/)
  })
})

/** Rotate about the centre with nearest-neighbour sampling. */
function rotate(c: ReturnType<typeof blank>, degrees: number) {
  const out = blank(c.width, c.height)
  const a = (degrees * Math.PI) / 180
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  const cx = c.width / 2
  const cy = c.height / 2
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      const dx = x - cx
      const dy = y - cy
      const sx = Math.round(cx + dx * cos + dy * sin)
      const sy = Math.round(cy - dx * sin + dy * cos)
      if (sx < 0 || sy < 0 || sx >= c.width || sy >= c.height) continue
      const si = (sy * c.width + sx) * 4
      const di = (y * c.width + x) * 4
      out.data[di] = c.data[si]
      out.data[di + 1] = c.data[si + 1]
      out.data[di + 2] = c.data[si + 2]
    }
  }
  return out
}

describe('recognize, harder pages', () => {
  it('reads a chord as simultaneous notes', () => {
    const { canvas, treble } = page()
    chord(canvas, treble, [0, 2, 4], 300, 1) // E4 G4 B4, stacked in thirds
    const { score } = recognize(toImageData(canvas))
    expect(score.notes.map((n) => midiToName(n.midi)).sort()).toEqual(['B4', 'E4', 'G4'])
    expect(new Set(score.notes.map((n) => n.start)).size).toBe(1)
  })

  it('reads notes on ledger lines above the staff', () => {
    const { canvas, treble } = page()
    ;[9, 10, 12].forEach((step, i) => note(canvas, treble, { step, x: 250 + i * 110, value: 1 }))
    const { score } = recognize(toImageData(canvas))
    expect(score.notes.map((n) => midiToName(n.midi))).toEqual(['G5', 'A5', 'C6'])
  })

  it('reads a beamed run of eighths without mistaking the beam for a note', () => {
    const { canvas, treble } = page()
    beamed(
      canvas,
      treble,
      [0, 1, 2, 3].map((step, i) => ({ step, x: 250 + i * 45 })),
      1,
    )
    const { score } = recognize(toImageData(canvas))
    expect(score.notes.map((n) => midiToName(n.midi))).toEqual(['E4', 'F4', 'G4', 'A4'])
    expect(score.notes.map((n) => n.duration)).toEqual([0.5, 0.5, 0.5, 0.5])
    expect(score.notes.map((n) => n.start)).toEqual([0, 0.5, 1, 1.5])
  })

  it('counts a double beam as sixteenths', () => {
    const { canvas, treble } = page()
    beamed(
      canvas,
      treble,
      [2, 2, 2, 2].map((step, i) => ({ step, x: 250 + i * 45 })),
      2,
    )
    const { score } = recognize(toImageData(canvas))
    expect(score.notes).toHaveLength(4)
    expect(score.notes.every((n) => n.duration === 0.25)).toBe(true)
  })

  it('applies a sharp and a flat written next to a note', () => {
    const { canvas, treble } = page()
    note(canvas, treble, { step: 2, x: 300, value: 1 })
    accidental(canvas, treble, 2, 300 - SPACE * 1.6, 'sharp')
    note(canvas, treble, { step: 4, x: 500, value: 1 })
    accidental(canvas, treble, 4, 500 - SPACE * 1.6, 'flat')

    const { score } = recognize(toImageData(canvas))
    expect(score.notes.map((n) => midiToName(n.midi))).toEqual(['G#4', 'A#4'])
  })

  it('applies a key signature to every note of that letter', () => {
    const { canvas, treble } = page()
    ;[1, 2, 8].forEach((step, i) => note(canvas, treble, { step, x: 250 + i * 110, value: 1 }))
    const { score } = recognize(toImageData(canvas), { fifths: 1 }) // G major: F sharp
    expect(score.notes.map((n) => midiToName(n.midi))).toEqual(['F#4', 'G4', 'F#5'])
  })

  it('reads several systems down the page in order', () => {
    const canvas = blank(1000, 900)
    for (let sys = 0; sys < 2; sys++) {
      const t: StaffSpec = { top: 70 + sys * 340, left: 60, right: 940, space: SPACE }
      const b: StaffSpec = { top: 70 + sys * 340 + SPACE * 9, left: 60, right: 940, space: SPACE }
      staff(canvas, t)
      staff(canvas, b)
      clefMark(canvas, t, true)
      clefMark(canvas, b, false)
      for (let i = 0; i < 4; i++) note(canvas, t, { step: sys === 0 ? 0 : 4, x: 220 + i * 90, value: 1 })
      barline(canvas, t, 620)
      barline(canvas, b, 620)
    }
    const { score } = recognize(toImageData(canvas))
    const right = score.notes.filter((n) => n.hand === 'right')
    expect(right).toHaveLength(8)
    // Second system carries on where the first left off, not back at zero.
    expect(right.map((n) => n.start)).toEqual([0, 1, 2, 3, 8, 9, 10, 11])
    expect(right.slice(4).every((n) => midiToName(n.midi) === 'B4')).toBe(true)
  })

  it('lengthens a dotted note by half, on a line and in a space', () => {
    const { canvas, treble } = page()
    note(canvas, treble, { step: 2, x: 260, value: 2, dotted: true })
    note(canvas, treble, { step: 5, x: 480, value: 1, dotted: true })
    note(canvas, treble, { step: 3, x: 700, value: 1 })

    const { score } = recognize(toImageData(canvas))
    expect(score.notes.map((n) => n.duration)).toEqual([3, 1.5, 1])
  })
})

describe('recognize, photographs rather than scans', () => {
  it('reads a page shot under uneven light with sensor noise', () => {
    const { canvas, treble } = page()
    ;[0, 2, 4, 6].forEach((step, i) => note(canvas, treble, { step, x: 240 + i * 100, value: 1 }))

    // A hard diagonal falloff plus grain: the case a global threshold gets wrong.
    let seed = 7
    const random = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff - 0.5)
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const i = (y * canvas.width + x) * 4
        const shade = 1 - 0.55 * (x / canvas.width) - 0.25 * (y / canvas.height)
        const v = Math.max(0, Math.min(255, canvas.data[i] * shade + random() * 26))
        canvas.data[i] = canvas.data[i + 1] = canvas.data[i + 2] = v
      }
    }

    const { score } = recognize(toImageData(canvas))
    expect(score.notes.map((n) => midiToName(n.midi))).toEqual(['E4', 'G4', 'B4', 'D5'])
  })

  it('reads a natural sign as cancelling the key signature', () => {
    const { canvas, treble } = page()
    note(canvas, treble, { step: 1, x: 300, value: 1 })
    note(canvas, treble, { step: 1, x: 520, value: 1 })
    natural(canvas, treble, 1, 520 - SPACE * 1.7)

    const { score } = recognize(toImageData(canvas), { fifths: 1 }) // F sharp in the key
    expect(score.notes.map((n) => midiToName(n.midi))).toEqual(['F#4', 'F4'])
  })

  it('lets a rest push the notes after it later in the bar', () => {
    const { canvas, treble } = page()
    rest(canvas, treble, 220, 1)
    note(canvas, treble, { step: 4, x: 340, value: 1 })
    note(canvas, treble, { step: 4, x: 460, value: 1 })

    const { score } = recognize(toImageData(canvas))
    expect(score.notes.map((n) => n.start)).toEqual([1, 2])
  })

  it('does not invent notes on an empty staff', () => {
    const { canvas } = page()
    const { score } = recognize(toImageData(canvas))
    expect(score.notes).toEqual([])
  })
})

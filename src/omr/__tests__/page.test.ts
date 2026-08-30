import { describe, expect, it } from 'vitest'
import { recognize } from '../recognize'
import { midiToName } from '../../lib/music'
import { barline, blank, chord, clefMark, note, staff, toImageData, type StaffSpec } from './render'

const SPACE = 22

/** A whole page: two systems of a grand staff, tune over chords, four bars each. */
function fullPage() {
  const canvas = blank(1500, 760)
  const melody: [number, number][] = [
    [0, 1], [0, 1], [1, 1], [2, 1],
    [2, 1], [1, 1], [0, 1], [-1, 1],
    [-2, 1], [-2, 1], [-1, 1], [0, 1],
    [0, 1.5], [-1, 0.5], [-1, 2],
  ]

  for (let sys = 0; sys < 2; sys++) {
    const top = 80 + sys * 400
    const treble: StaffSpec = { top, left: 70, right: 1430, space: SPACE }
    const bass: StaffSpec = { top: top + SPACE * 7, left: 70, right: 1430, space: SPACE }
    staff(canvas, treble)
    staff(canvas, bass)
    clefMark(canvas, treble, true)
    clefMark(canvas, bass, false)

    let index = 0
    for (let bar = 0; bar < 4; bar++) {
      const x0 = 210 + bar * 305
      let x = x0
      let beats = 0
      while (beats < 4 && index < melody.length) {
        const [step, value] = melody[index]
        note(canvas, treble, { step, x, value, dotted: value === 1.5 })
        x += 70 * Math.max(1, value)
        beats += value
        index++
      }
      chord(canvas, bass, bar % 2 === 0 ? [0, 2, 4] : [-1, 1, 3], x0 + 20, 2)
      chord(canvas, bass, bar % 2 === 0 ? [0, 2, 4] : [-1, 1, 3], x0 + 160, 2)
      if (bar < 3) {
        barline(canvas, treble, x0 + 285)
        barline(canvas, bass, x0 + 285)
      }
    }
  }
  return canvas
}

describe('a whole page', () => {
  const { score } = recognize(toImageData(fullPage()))
  const right = score.notes.filter((n) => n.hand === 'right')
  const left = score.notes.filter((n) => n.hand === 'left')

  it('finds eight bars across two systems', () => {
    expect(score.measures).toHaveLength(8)
  })

  it('splits the hands correctly', () => {
    // 15 melody notes and 8 three-note chords per system.
    expect(right).toHaveLength(30)
    expect(left).toHaveLength(48)
  })

  it('reads the tune', () => {
    const bar1 = right.filter((n) => n.start < 4).map((n) => midiToName(n.midi))
    expect(bar1).toEqual(['E4', 'E4', 'F4', 'G4'])
  })

  it('gives the left-hand chords their written length', () => {
    expect(new Set(left.map((n) => n.duration))).toEqual(new Set([2]))
  })

  it('stacks each chord on one onset', () => {
    const first = left.filter((n) => n.start === 0)
    expect(first.map((n) => midiToName(n.midi))).toEqual(['G2', 'B2', 'D3'])
  })

  it('carries the second system on from the first', () => {
    expect(Math.max(...right.map((n) => n.start))).toBeGreaterThan(24)
  })

  it('is confident about a clean page', () => {
    expect(score.confidence).toBeGreaterThan(0.85)
  })
})

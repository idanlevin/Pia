/**
 * Render a page of printed music to a PNG, for driving the app in a real browser.
 * Reuses the engraver the recogniser is tested against rather than a second one.
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { encodePng } from './png.mjs'
import * as e from '../.fixtures/render.js'

const SPACE = 22
const canvas = e.blank(1500, 760)

// Two systems of a grand staff: a right-hand tune over left-hand chords.
const melody = [
  [0, 1], [0, 1], [1, 1], [2, 1],
  [2, 1], [1, 1], [0, 1], [-1, 1],
  [-2, 1], [-2, 1], [-1, 1], [0, 1],
  [0, 1.5], [-1, 0.5], [-1, 2],
]

for (let sys = 0; sys < 2; sys++) {
  // The gap inside a grand staff must stay clearly smaller than the gap between
  // systems, or nothing can tell the two hands from two separate pieces.
  let index = 0
  const top = 80 + sys * 400
  const treble = { top, left: 70, right: 1430, space: SPACE }
  const bass = { top: top + SPACE * 7, left: 70, right: 1430, space: SPACE }
  e.staff(canvas, treble)
  e.staff(canvas, bass)
  e.clefMark(canvas, treble, true)
  e.clefMark(canvas, bass, false)

  for (let bar = 0; bar < 4; bar++) {
    const x0 = 210 + bar * 305
    let x = x0
    let beats = 0
    while (beats < 4 && index < melody.length) {
      const [step, value] = melody[index]
      e.note(canvas, treble, { step, x, value, dotted: value === 1.5 })
      x += 70 * Math.max(1, value)
      beats += value
      index++
    }
    e.chord(canvas, bass, bar % 2 === 0 ? [0, 2, 4] : [-1, 1, 3], x0 + 20, 2)
    e.chord(canvas, bass, bar % 2 === 0 ? [0, 2, 4] : [-1, 1, 3], x0 + 160, 2)
    if (bar < 3) e.barline(canvas, treble, x0 + 285)
    if (bar < 3) e.barline(canvas, bass, x0 + 285)
  }
}

mkdirSync('.fixtures', { recursive: true })
writeFileSync('.fixtures/sheet.png', encodePng(canvas.data, canvas.width, canvas.height))
console.log(`wrote .fixtures/sheet.png (${canvas.width}x${canvas.height})`)

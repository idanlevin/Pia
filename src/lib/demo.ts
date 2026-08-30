/**
 * Built-in pieces, so the very first thing a visitor can do is press play.
 *
 * Written in a compact shorthand — "C4 E4/2 C3+E3+G3/4" is two notes and a chord, the
 * number after the slash being the length in beats — because a table of start times
 * is unreadable and unfixable.
 */

import { nameToMidi } from './music'
import type { Hand, Note, Score } from './types'

let counter = 0

function parse(spec: string, hand: Hand, from = 0): { notes: Note[]; end: number } {
  const notes: Note[] = []
  let time = from
  for (const token of spec.trim().split(/\s+/)) {
    const [pitches, length] = token.split('/')
    const duration = length ? Number(length) : 1
    if (pitches !== 'r') {
      for (const pitch of pitches.split('+')) {
        notes.push({
          id: `d${counter++}`,
          midi: nameToMidi(pitch),
          start: time,
          duration,
          hand,
          confidence: 1,
          measure: Math.floor(time / 4),
        })
      }
    }
    time += duration
  }
  return { notes, end: time }
}

function build(title: string, right: string, left: string, tempo: number): Score {
  const r = parse(right, 'right')
  const l = parse(left, 'left')
  const length = Math.max(r.end, l.end)
  const measures = []
  for (let m = 0; m * 4 < length; m++) measures.push(m * 4)
  return {
    id: `demo-${title.toLowerCase().replace(/\W+/g, '-')}`,
    title,
    notes: [...r.notes, ...l.notes].sort((a, b) => a.start - b.start || a.midi - b.midi),
    key: { fifths: 0 },
    time: { beats: 4, beatType: 4 },
    tempo,
    measures,
    length,
    detections: [],
    imageWidth: 0,
    imageHeight: 0,
    confidence: 1,
    diagnostics: ['A built-in piece — scan a page to replace it.'],
  }
}

export const DEMOS: Score[] = [
  build(
    'Ode to Joy',
    `E4 E4 F4 G4  G4 F4 E4 D4  C4 C4 D4 E4  E4/1.5 D4/0.5 D4/2
     E4 E4 F4 G4  G4 F4 E4 D4  C4 C4 D4 E4  D4/1.5 C4/0.5 C4/2`,
    `C3+G3/2 C3+G3/2  G2+D3/2 G2+D3/2  C3+G3/2 C3+G3/2  G2+D3/2 C3+G3/2
     C3+G3/2 C3+G3/2  G2+D3/2 G2+D3/2  C3+G3/2 C3+G3/2  G2+B2/2 C3+G3/2`,
    92,
  ),
  build(
    'Twinkle, Twinkle',
    `C4 C4 G4 G4  A4 A4 G4/2  F4 F4 E4 E4  D4 D4 C4/2`,
    `C3+E3/2 C3+E3/2  F2+C3/2 C3+E3/2  F2+A2/2 C3+E3/2  G2+B2/2 C3+E3/2`,
    100,
  ),
  build(
    'C major, hands together',
    `C4/0.5 D4/0.5 E4/0.5 F4/0.5 G4/0.5 A4/0.5 B4/0.5 C5/0.5
     C5/0.5 B4/0.5 A4/0.5 G4/0.5 F4/0.5 E4/0.5 D4/0.5 C4/2`,
    `C3/0.5 D3/0.5 E3/0.5 F3/0.5 G3/0.5 A3/0.5 B3/0.5 C4/0.5
     C4/0.5 B3/0.5 A3/0.5 G3/0.5 F3/0.5 E3/0.5 D3/0.5 C3/2`,
    76,
  ),
]

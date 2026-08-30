/** Export a Score as a standard MIDI file, so a piece can leave the app. */

import type { Score } from './types'

const TICKS_PER_BEAT = 480

function variableLength(value: number): number[] {
  const bytes = [value & 0x7f]
  let v = value >> 7
  while (v > 0) {
    bytes.unshift((v & 0x7f) | 0x80)
    v >>= 7
  }
  return bytes
}

function chunk(id: string, body: number[]): number[] {
  const length = body.length
  return [
    ...[...id].map((c) => c.charCodeAt(0)),
    (length >> 24) & 0xff,
    (length >> 16) & 0xff,
    (length >> 8) & 0xff,
    length & 0xff,
    ...body,
  ]
}

export function toMidiFile(score: Score): Blob {
  const events: { tick: number; data: number[] }[] = []
  const microsPerBeat = Math.round(60_000_000 / score.tempo)
  events.push({
    tick: 0,
    data: [0xff, 0x51, 0x03, (microsPerBeat >> 16) & 0xff, (microsPerBeat >> 8) & 0xff, microsPerBeat & 0xff],
  })
  events.push({
    tick: 0,
    data: [0xff, 0x58, 0x04, score.time.beats, Math.log2(score.time.beatType), 24, 8],
  })

  for (const note of score.notes) {
    const channel = note.hand === 'left' ? 1 : 0
    const on = Math.round(note.start * TICKS_PER_BEAT)
    const off = Math.round((note.start + note.duration) * TICKS_PER_BEAT)
    events.push({ tick: on, data: [0x90 | channel, note.midi, note.hand === 'left' ? 72 : 88] })
    events.push({ tick: off, data: [0x80 | channel, note.midi, 0] })
  }

  events.sort((a, b) => a.tick - b.tick)
  const track: number[] = []
  let last = 0
  for (const event of events) {
    track.push(...variableLength(event.tick - last), ...event.data)
    last = event.tick
  }
  track.push(0x00, 0xff, 0x2f, 0x00)

  const header = chunk('MThd', [0, 0, 0, 1, (TICKS_PER_BEAT >> 8) & 0xff, TICKS_PER_BEAT & 0xff])
  const bytes = new Uint8Array([...header, ...chunk('MTrk', track)])
  return new Blob([bytes], { type: 'audio/midi' })
}

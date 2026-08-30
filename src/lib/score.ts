/** Editing a Score. Every operation returns a new one; nothing is mutated in place. */

import { diatonicToMidi, keyAlteration } from './music'
import type { Hand, Note, Score } from './types'

let counter = 0

function withNotes(score: Score, notes: Note[]): Score {
  const sorted = [...notes].sort((a, b) => a.start - b.start || a.midi - b.midi)
  const end = sorted.reduce((a, n) => Math.max(a, n.start + n.duration), 0)
  return {
    ...score,
    notes: sorted,
    length: Math.max(end, score.measures.length * score.time.beats),
  }
}

export function updateNote(score: Score, id: string, patch: Partial<Note>): Score {
  return withNotes(
    score,
    score.notes.map((n) => (n.id === id ? { ...n, ...patch, confidence: 1 } : n)),
  )
}

export function removeNote(score: Score, id: string): Score {
  const kept = score.notes.filter((n) => n.id !== id)
  const next = withNotes(score, kept)
  // Deleting the last note must not collapse the piece to nothing.
  return { ...next, detections: score.detections.filter((d) => d.noteId !== id) }
}

export function addNote(score: Score, midi: number, start: number, hand: Hand): Score {
  const note: Note = {
    id: `e${counter++}`,
    midi,
    start,
    duration: 1,
    hand,
    confidence: 1,
    measure: Math.floor(start / score.time.beats),
  }
  return withNotes(score, [...score.notes, note])
}

/** Transpose one note by semitones, keeping its spelling explicit from then on. */
export function nudgePitch(score: Score, id: string, semitones: number): Score {
  const note = score.notes.find((n) => n.id === id)
  if (!note) return score
  const midi = Math.max(21, Math.min(108, note.midi + semitones))
  return updateNote(score, id, { midi, diatonic: undefined, explicitAlter: null })
}

/**
 * Re-apply a key signature. Only notes read straight off the staff move: anything
 * with an accidental written beside it, or edited by hand, keeps the pitch it has.
 */
export function rekey(score: Score, fifths: number): Score {
  const notes = score.notes.map((note) => {
    if (note.diatonic === undefined || note.explicitAlter !== null) return note
    const letter = ((note.diatonic % 7) + 7) % 7
    return { ...note, midi: diatonicToMidi(note.diatonic, keyAlteration(fifths, letter)) }
  })
  return { ...withNotes(score, notes), key: { fifths } }
}

export function pitchRange(score: Score): { low: number; high: number } {
  if (score.notes.length === 0) return { low: 48, high: 84 }
  const pitches = score.notes.map((n) => n.midi)
  // Always show at least two octaves, or a single-note piece renders three keys.
  const low = Math.min(...pitches)
  const high = Math.max(...pitches)
  const pad = Math.max(0, 24 - (high - low)) / 2
  return {
    low: Math.max(21, Math.round(low - pad - 2)),
    high: Math.min(108, Math.round(high + pad + 2)),
  }
}

/** Core data model. Everything downstream of recognition speaks these types. */

export type Hand = 'right' | 'left'

export type ClefType = 'treble' | 'bass'

/** A single sounding note. Times are in quarter-note beats from the start. */
export interface Note {
  id: string
  midi: number
  /** Onset in quarter-note beats. */
  start: number
  /** Length in quarter-note beats. */
  duration: number
  hand: Hand
  /** 0..1 — how sure the recogniser is. Hand-edited notes are 1. */
  confidence: number
  /** Index into Score.measures, or -1 when no barlines were found. */
  measure: number
  /** Staff position as a diatonic index, kept so a change of key can be re-applied. */
  diatonic?: number
  /** Alteration written beside the note, if any. Null means "whatever the key says". */
  explicitAlter?: number | null
}

export interface KeySignature {
  /** Negative = flats, positive = sharps, 0 = C major / A minor. */
  fifths: number
}

export interface TimeSignature {
  beats: number
  beatType: number
}

/** Where a notehead was found in the source image, for the overlay. */
export interface Detection {
  x: number
  y: number
  w: number
  h: number
  noteId: string
}

export interface Score {
  id: string
  title: string
  notes: Note[]
  key: KeySignature
  time: TimeSignature
  /** Suggested tempo in BPM (quarter notes per minute). */
  tempo: number
  /** Beat position of each barline, including 0. */
  measures: number[]
  /** Total length in beats. */
  length: number
  /** Detection boxes in source-image pixel coordinates. */
  detections: Detection[]
  /** Size of the image the detections refer to. */
  imageWidth: number
  imageHeight: number
  /** Overall recognition confidence, 0..1. */
  confidence: number
  /** Human-readable notes about what the recogniser did or couldn't do. */
  diagnostics: string[]
}

export interface StoredPiece {
  id: string
  title: string
  createdAt: number
  score: Score
  /** Small JPEG data URL for the library list. */
  thumbnail: string
}

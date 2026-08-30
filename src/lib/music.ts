/** Note names, MIDI arithmetic and key signatures. */

const SEMITONE_OF_LETTER = [0, 2, 4, 5, 7, 9, 11] // C D E F G A B
const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B']
const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']

/** Order sharps and flats appear in a key signature, as letter indices. */
const SHARP_ORDER = [3, 0, 4, 1, 5, 2, 6] // F C G D A E B
const FLAT_ORDER = [6, 2, 5, 1, 4, 0, 3] // B E A D G C F

/**
 * A diatonic step index: 0 = C0, counting only letter names.
 * This is the natural coordinate for "how high on the staff" a note sits.
 */
export function diatonicToMidi(diatonic: number, alter: number): number {
  const letter = ((diatonic % 7) + 7) % 7
  const octave = Math.floor(diatonic / 7)
  return 12 * (octave + 1) + SEMITONE_OF_LETTER[letter] + alter
}

export function diatonicOf(letter: string, octave: number): number {
  return octave * 7 + LETTERS.indexOf(letter.toUpperCase())
}

export function midiToName(midi: number, preferFlats = false): string {
  const names = preferFlats ? FLAT_NAMES : SHARP_NAMES
  const octave = Math.floor(midi / 12) - 1
  return `${names[((midi % 12) + 12) % 12]}${octave}`
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12)
}

export function isBlackKey(midi: number): boolean {
  return [1, 3, 6, 8, 10].includes(((midi % 12) + 12) % 12)
}

/** Alteration (-1, 0, +1) that a key signature applies to a letter index. */
export function keyAlteration(fifths: number, letter: number): number {
  if (fifths > 0) return SHARP_ORDER.slice(0, Math.min(fifths, 7)).includes(letter) ? 1 : 0
  if (fifths < 0) return FLAT_ORDER.slice(0, Math.min(-fifths, 7)).includes(letter) ? -1 : 0
  return 0
}

export const KEY_NAMES: { fifths: number; label: string }[] = [
  { fifths: -7, label: 'Cb major / Ab minor' },
  { fifths: -6, label: 'Gb major / Eb minor' },
  { fifths: -5, label: 'Db major / Bb minor' },
  { fifths: -4, label: 'Ab major / F minor' },
  { fifths: -3, label: 'Eb major / C minor' },
  { fifths: -2, label: 'Bb major / G minor' },
  { fifths: -1, label: 'F major / D minor' },
  { fifths: 0, label: 'C major / A minor' },
  { fifths: 1, label: 'G major / E minor' },
  { fifths: 2, label: 'D major / B minor' },
  { fifths: 3, label: 'A major / F# minor' },
  { fifths: 4, label: 'E major / C# minor' },
  { fifths: 5, label: 'B major / G# minor' },
  { fifths: 6, label: 'F# major / D# minor' },
  { fifths: 7, label: 'C# major / A# minor' },
]

/** Bottom line of the staff, as a diatonic index. */
export const CLEF_BOTTOM_LINE: Record<string, number> = {
  treble: diatonicOf('E', 4),
  bass: diatonicOf('G', 2),
}

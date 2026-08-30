/**
 * Fixing a misread note. The recogniser will get things wrong, so this is a normal
 * part of using the app rather than an advanced mode — hence the plain language and
 * the big targets.
 */

import { KEY_NAMES } from '../lib/music'
import { midiToName } from '../lib/music'
import type { Note, Score } from '../lib/types'

interface Props {
  score: Score
  note: Note | null
  onChange: (patch: Partial<Note>) => void
  onNudge: (semitones: number) => void
  onDelete: () => void
  onKeyChange: (fifths: number) => void
  onTempoChange: (bpm: number) => void
  onPreview: (midi: number) => void
}

const LENGTHS = [
  { value: 0.25, label: '16th' },
  { value: 0.5, label: '8th' },
  { value: 1, label: '¼' },
  { value: 1.5, label: '¼·' },
  { value: 2, label: '½' },
  { value: 3, label: '½·' },
  { value: 4, label: 'whole' },
]

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <span className="shrink-0 text-sm text-ink-300">{label}</span>
      <div className="flex flex-wrap justify-end gap-2">{children}</div>
    </div>
  )
}

export function NoteEditor({
  score,
  note,
  onChange,
  onNudge,
  onDelete,
  onKeyChange,
  onTempoChange,
  onPreview,
}: Props) {
  return (
    <div className="space-y-5">
      <section className="rounded-xl bg-ink-850 p-4 ring-1 ring-ink-700">
        <h3 className="mb-1 text-sm font-semibold">Whole piece</h3>
        <Row label="Key signature">
          <select
            value={score.key.fifths}
            onChange={(e) => onKeyChange(Number(e.target.value))}
            className="min-h-11 rounded-lg bg-ink-800 px-3 text-sm"
          >
            {KEY_NAMES.map((k) => (
              <option key={k.fifths} value={k.fifths}>
                {k.label}
              </option>
            ))}
          </select>
        </Row>
        <Row label="Written tempo">
          <input
            type="number"
            min={30}
            max={220}
            value={score.tempo}
            onChange={(e) => onTempoChange(Math.max(30, Math.min(220, Number(e.target.value))))}
            className="tabular min-h-11 w-24 rounded-lg bg-ink-800 px-3 text-sm"
            aria-label="Written tempo in beats per minute"
          />
          <span className="self-center text-sm text-ink-400">bpm</span>
        </Row>
      </section>

      <section className="rounded-xl bg-ink-850 p-4 ring-1 ring-ink-700">
        <h3 className="mb-1 text-sm font-semibold">
          {note ? `Selected note — ${midiToName(note.midi)}` : 'Selected note'}
        </h3>
        {!note ? (
          <p className="py-3 text-sm text-ink-400">
            Tap a note in the roll above to change its pitch, its length or which hand
            plays it. Tap an empty spot to move the playhead there instead.
          </p>
        ) : (
          <>
            <Row label="Pitch">
              <button
                onClick={() => {
                  onNudge(-12)
                  onPreview(note.midi - 12)
                }}
                className="min-h-11 rounded-lg bg-ink-800 px-3 text-sm"
              >
                −8ve
              </button>
              <button
                onClick={() => {
                  onNudge(-1)
                  onPreview(note.midi - 1)
                }}
                className="min-h-11 rounded-lg bg-ink-800 px-4 text-sm"
              >
                −
              </button>
              <button
                onClick={() => {
                  onNudge(1)
                  onPreview(note.midi + 1)
                }}
                className="min-h-11 rounded-lg bg-ink-800 px-4 text-sm"
              >
                +
              </button>
              <button
                onClick={() => {
                  onNudge(12)
                  onPreview(note.midi + 12)
                }}
                className="min-h-11 rounded-lg bg-ink-800 px-3 text-sm"
              >
                +8ve
              </button>
            </Row>

            <Row label="Length">
              {LENGTHS.map((l) => (
                <button
                  key={l.value}
                  onClick={() => onChange({ duration: l.value })}
                  aria-pressed={note.duration === l.value}
                  className={`min-h-11 rounded-lg px-3 text-sm ${
                    note.duration === l.value ? 'bg-sky-ui text-ink-950' : 'bg-ink-800'
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </Row>

            <Row label="Starts at beat">
              <button
                onClick={() => onChange({ start: Math.max(0, note.start - 0.25) })}
                className="min-h-11 rounded-lg bg-ink-800 px-4 text-sm"
              >
                −
              </button>
              <span className="tabular min-w-14 self-center text-center text-sm">
                {(note.start + 1).toFixed(2)}
              </span>
              <button
                onClick={() => onChange({ start: note.start + 0.25 })}
                className="min-h-11 rounded-lg bg-ink-800 px-4 text-sm"
              >
                +
              </button>
            </Row>

            <Row label="Hand">
              {(['left', 'right'] as const).map((hand) => (
                <button
                  key={hand}
                  onClick={() => onChange({ hand })}
                  aria-pressed={note.hand === hand}
                  className={`min-h-11 rounded-lg px-4 text-sm capitalize ${
                    note.hand === hand ? 'bg-sky-ui text-ink-950' : 'bg-ink-800'
                  }`}
                >
                  {hand}
                </button>
              ))}
            </Row>

            <button
              onClick={onDelete}
              className="mt-2 min-h-11 w-full rounded-lg bg-red-500/15 text-sm font-medium text-red-300"
            >
              Delete this note
            </button>
          </>
        )}
      </section>
    </div>
  )
}

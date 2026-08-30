/** Play, and the practice controls that are the actual point of the app. */

import type { Score } from '../lib/types'

export interface Practice {
  /** 25–200, as a percentage of the score's own tempo. */
  speed: number
  loop: { start: number; end: number } | null
  mutedLeft: boolean
  mutedRight: boolean
  metronome: boolean
  countIn: boolean
}

interface Props {
  score: Score
  playing: boolean
  measure: number
  practice: Practice
  onPractice: (next: Practice) => void
  onToggle: () => void
  onRestart: () => void
}

function Toggle({
  on,
  onClick,
  children,
  label,
}: {
  on: boolean
  onClick: () => void
  children: React.ReactNode
  label?: string
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      aria-label={label}
      className={`min-h-11 rounded-full px-4 text-sm font-medium transition ${
        on ? 'bg-sky-ui text-ink-950' : 'bg-ink-800 text-ink-300 hover:bg-ink-700'
      }`}
    >
      {children}
    </button>
  )
}

export function Transport({
  score,
  playing,
  measure,
  practice,
  onPractice,
  onToggle,
  onRestart,
}: Props) {
  const set = (patch: Partial<Practice>) => onPractice({ ...practice, ...patch })
  const bars = Math.max(1, score.measures.length)
  const bpm = Math.round((score.tempo * practice.speed) / 100)

  const toggleLoop = () => {
    if (practice.loop) return set({ loop: null })
    // Default to the bar you are on, which is almost always the one you are stuck in.
    const start = Math.min(measure, bars - 1) * score.time.beats
    set({ loop: { start, end: Math.min(start + score.time.beats * 2, score.length) } })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <button
          onClick={onToggle}
          aria-label={playing ? 'Pause' : 'Play'}
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-glow-400 text-ink-950 transition active:scale-95"
        >
          {playing ? (
            <svg width="20" height="22" viewBox="0 0 20 22" fill="currentColor" aria-hidden>
              <rect x="1" y="1" width="6.5" height="20" rx="1.5" />
              <rect x="12.5" y="1" width="6.5" height="20" rx="1.5" />
            </svg>
          ) : (
            <svg width="20" height="22" viewBox="0 0 20 22" fill="currentColor" aria-hidden>
              <path d="M3 1.8v18.4a1 1 0 0 0 1.53.85l14.2-9.2a1 1 0 0 0 0-1.7L4.53.95A1 1 0 0 0 3 1.8Z" />
            </svg>
          )}
        </button>

        <button
          onClick={onRestart}
          aria-label="Back to the start"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink-800 text-ink-300"
        >
          <svg width="17" height="17" viewBox="0 0 18 18" fill="currentColor" aria-hidden>
            <rect x="1" y="1" width="2.6" height="16" rx="1" />
            <path d="M17 2.6v12.8a1 1 0 0 1-1.55.83L5.9 9.83a1 1 0 0 1 0-1.66l9.55-6.4A1 1 0 0 1 17 2.6Z" />
          </svg>
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-ink-300">
              Bar <span className="tabular text-ink-100">{Math.min(measure + 1, bars)}</span>
              <span className="text-ink-400"> / {bars}</span>
            </span>
            <span className="tabular text-ink-300">{bpm} bpm</span>
          </div>
          <input
            type="range"
            min={25}
            max={200}
            step={5}
            value={practice.speed}
            onChange={(e) => set({ speed: Number(e.target.value) })}
            aria-label="Tempo, as a percentage of the written tempo"
            className="w-full"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Toggle on={!!practice.loop} onClick={toggleLoop}>
          Loop
        </Toggle>
        <Toggle on={!practice.mutedRight} onClick={() => set({ mutedRight: !practice.mutedRight })}>
          Right hand
        </Toggle>
        <Toggle on={!practice.mutedLeft} onClick={() => set({ mutedLeft: !practice.mutedLeft })}>
          Left hand
        </Toggle>
        <Toggle on={practice.metronome} onClick={() => set({ metronome: !practice.metronome })}>
          Click
        </Toggle>
        <Toggle on={practice.countIn} onClick={() => set({ countIn: !practice.countIn })}>
          Count in
        </Toggle>
      </div>

      {practice.loop && (
        <div className="flex items-center gap-3 rounded-xl bg-ink-850 px-4 py-3 text-sm ring-1 ring-ink-700">
          <span className="text-ink-300">Looping bars</span>
          <NumberStep
            value={Math.floor(practice.loop.start / score.time.beats) + 1}
            min={1}
            max={bars}
            onChange={(v) => {
              const start = (v - 1) * score.time.beats
              set({ loop: { start, end: Math.max(practice.loop!.end, start + score.time.beats) } })
            }}
          />
          <span className="text-ink-400">to</span>
          <NumberStep
            value={Math.ceil(practice.loop.end / score.time.beats)}
            min={1}
            max={bars}
            onChange={(v) => {
              const end = v * score.time.beats
              set({ loop: { start: Math.min(practice.loop!.start, end - score.time.beats), end } })
            }}
          />
        </div>
      )}
    </div>
  )
}

function NumberStep({
  value,
  min,
  max,
  onChange,
}: {
  value: number
  min: number
  max: number
  onChange: (value: number) => void
}) {
  return (
    <span className="inline-flex items-center overflow-hidden rounded-lg bg-ink-800">
      <button
        onClick={() => onChange(Math.max(min, value - 1))}
        aria-label="One fewer"
        className="h-9 w-9 text-ink-300"
      >
        −
      </button>
      <span className="tabular w-7 text-center">{value}</span>
      <button
        onClick={() => onChange(Math.min(max, value + 1))}
        aria-label="One more"
        className="h-9 w-9 text-ink-300"
      >
        +
      </button>
    </span>
  )
}

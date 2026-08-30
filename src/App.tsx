/** Screen flow, and the wiring between recognition, the transport and the views. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Player, soundingAt } from './audio/player'
import { canSaveFiles, saveFile } from './lib/download'
import { toMidiFile } from './lib/midi'
import { addNote, nudgePitch, pitchRange, rekey, removeNote, updateNote } from './lib/score'
import { deletePiece, loadLibrary, savePiece } from './lib/storage'
import type { Score, StoredPiece } from './lib/types'
import OmrWorker from './omr/worker?worker&inline'
import type { WorkerRequest, WorkerResponse } from './omr/worker'
import { Home } from './ui/Home'
import { Keyboard, type KeyState } from './ui/Keyboard'
import { NoteEditor } from './ui/NoteEditor'
import { PianoRoll } from './ui/PianoRoll'
import { Scanner } from './ui/Scanner'
import { SheetView } from './ui/SheetView'
import { Transport, type Practice } from './ui/Transport'

type Screen = 'home' | 'camera' | 'analyzing' | 'player'
type Tab = 'play' | 'fix' | 'sheet'

const DEFAULT_PRACTICE: Practice = {
  speed: 100,
  loop: null,
  mutedLeft: false,
  mutedRight: false,
  metronome: false,
  countIn: false,
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const [tab, setTab] = useState<Tab>('play')
  const [score, setScore] = useState<Score | null>(null)
  const [image, setImage] = useState<string | null>(null)
  const [library, setLibrary] = useState<StoredPiece[]>(() => loadLibrary())
  const [practice, setPractice] = useState<Practice>(DEFAULT_PRACTICE)
  const [selected, setSelected] = useState<string | null>(null)
  const [progress, setProgress] = useState({ stage: 'Starting', fraction: 0 })
  const [error, setError] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [measure, setMeasure] = useState(0)
  const [sounding, setSounding] = useState<Map<number, KeyState>>(new Map())
  const [saved, setSaved] = useState(false)

  const playerRef = useRef<Player | null>(null)
  // Read by the animation loop, which must not be rebuilt on every toggle.
  const practiceRef = useRef(practice)
  useEffect(() => {
    practiceRef.current = practice
  }, [practice])
  const workerRef = useRef<Worker | null>(null)
  const pausedBeat = useRef(0)

  const ensurePlayer = useCallback(() => {
    if (!playerRef.current) {
      // Built inside a user gesture, so the audio context is allowed to start.
      playerRef.current = new Player(new AudioContext(), { onStop: () => setPlaying(false) })
    }
    return playerRef.current
  }, [])

  const getPosition = useCallback(
    () => playerRef.current?.position ?? pausedBeat.current,
    [],
  )

  // Push the current practice settings and notes into the transport.
  useEffect(() => {
    const player = playerRef.current
    if (!player || !score) return
    player.tempo = (score.tempo * practice.speed) / 100
    player.loop = practice.loop
    player.muted = { left: practice.mutedLeft, right: practice.mutedRight }
    player.metronome = practice.metronome
    player.beatsPerMeasure = score.time.beats
    player.countIn = practice.countIn ? score.time.beats : 0
    player.load(score.notes, score.length)
  }, [score, practice])

  // One animation loop drives every live readout. React state is only touched when
  // something a human can see has actually changed.
  useEffect(() => {
    if (screen !== 'player' || !score) return
    let raf = 0
    let lastKey = ''
    let lastMeasure = -1

    const tick = () => {
      const beat = getPosition()
      pausedBeat.current = beat

      const bar = Math.floor(beat / score.time.beats)
      if (bar !== lastMeasure) {
        lastMeasure = bar
        setMeasure(bar)
      }

      const live = playerRef.current?.playing ? soundingAt(score.notes, beat) : []
      const muted = { left: practiceRef.current.mutedLeft, right: practiceRef.current.mutedRight }
      const key = live.map((n) => `${n.midi}${n.hand[0]}${muted[n.hand] ? 'm' : ''}`).join(',')
      if (key !== lastKey) {
        lastKey = key
        setSounding(new Map(live.map((n) => [n.midi, { hand: n.hand, yours: muted[n.hand] }])))
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [screen, score, getPosition])

  useEffect(() => () => workerRef.current?.terminate(), [])

  const analyse = useCallback((data: ImageData) => {
    setScreen('analyzing')
    setError(null)
    setProgress({ stage: 'Starting', fraction: 0 })

    workerRef.current?.terminate()
    // Inlined rather than fetched, so the app also runs from a single HTML file.
    const worker = new OmrWorker()
    workerRef.current = worker

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data
      if (message.type === 'progress') {
        setProgress({ stage: message.stage, fraction: message.fraction })
        return
      }
      if (message.type === 'error') {
        setError(message.message)
        setScreen('home')
        return
      }

      const { width, height } = message.preview
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (ctx) {
        const bitmap = ctx.createImageData(width, height)
        bitmap.data.set(message.preview.data)
        ctx.putImageData(bitmap, 0, 0)
      }
      setImage(canvas.toDataURL('image/jpeg', 0.82))
      setScore({ ...message.score, title: `Scan ${new Date().toLocaleDateString()}` })
      setPractice(DEFAULT_PRACTICE)
      setSelected(null)
      setSaved(false)
      ensurePlayer()
      setTab(message.score.notes.length === 0 ? 'sheet' : 'play')
      setScreen('player')
      worker.terminate()
      workerRef.current = null
    }

    // The bitmap is transferred, not copied: a full-resolution photo is 30 MB or more.
    const request: WorkerRequest = {
      data: data.data,
      width: data.width,
      height: data.height,
      options: {},
    }
    worker.postMessage(request, [data.data.buffer])
  }, [ensurePlayer])

  const openScore = useCallback(
    (next: Score, thumbnail: string | null) => {
      setScore(next)
      setImage(thumbnail)
      setPractice(DEFAULT_PRACTICE)
      setSelected(null)
      setSaved(true)
      setTab('play')
      ensurePlayer()
      setScreen('player')
    },
    [ensurePlayer],
  )

  const toggle = useCallback(() => {
    const player = ensurePlayer()
    if (player.playing) {
      player.pause()
      setPlaying(false)
    } else {
      void player.start()
      setPlaying(true)
    }
  }, [ensurePlayer])

  const leave = useCallback(() => {
    playerRef.current?.pause()
    setPlaying(false)
    setSounding(new Map())
    setScreen('home')
  }, [])

  useEffect(() => {
    if (screen !== 'player') return
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return
      if (event.code === 'Space') {
        event.preventDefault()
        toggle()
      }
      if (event.code === 'Escape') leave()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [screen, toggle, leave])

  const range = useMemo(() => (score ? pitchRange(score) : { low: 48, high: 72 }), [score])
  const canExport = useMemo(() => canSaveFiles(), [])
  const selectedNote = score?.notes.find((n) => n.id === selected) ?? null

  const edit = (next: Score) => {
    setScore(next)
    setSaved(false)
  }

  const save = () => {
    if (!score) return
    const thumb = image ?? ''
    setLibrary(savePiece(score, thumb))
    setSaved(true)
  }

  const exportMidi = () => {
    if (!score) return
    saveFile(`${score.title.replace(/\W+/g, '-').toLowerCase()}.mid`, toMidiFile(score))
  }

  if (screen === 'camera') {
    return <Scanner onCapture={analyse} onCancel={() => setScreen('home')} />
  }

  if (screen === 'analyzing') {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-6 px-8">
        <div className="w-full max-w-xs">
          <div className="h-1.5 overflow-hidden rounded-full bg-ink-800">
            <div
              className="h-full rounded-full bg-glow-400 transition-[width] duration-300"
              style={{ width: `${Math.round(progress.fraction * 100)}%` }}
            />
          </div>
          <p className="mt-4 text-center text-sm text-ink-300">{progress.stage}…</p>
        </div>
      </div>
    )
  }

  if (screen === 'player' && score) {
    return (
      <div className="flex min-h-full flex-col">
        <header className="flex items-center gap-3 px-4 pt-4 pb-3">
          <button
            onClick={leave}
            aria-label="Back"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink-850 text-ink-300"
          >
            ‹
          </button>
          <h1 className="min-w-0 flex-1 truncate text-lg font-semibold">{score.title}</h1>
          {image && (
            <button
              onClick={save}
              disabled={saved}
              className="min-h-11 rounded-full bg-ink-850 px-4 text-sm text-ink-300 disabled:opacity-45"
            >
              {saved ? 'Saved' : 'Save'}
            </button>
          )}
          {canExport && (
            <button
              onClick={exportMidi}
              className="min-h-11 rounded-full bg-ink-850 px-4 text-sm text-ink-300"
            >
              MIDI
            </button>
          )}
        </header>

        <nav className="flex gap-1 px-4 pb-3" role="tablist">
          {(['play', 'fix', 'sheet'] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`min-h-11 flex-1 rounded-lg text-sm font-medium transition ${
                tab === t ? 'bg-ink-800 text-ink-100' : 'text-ink-400'
              }`}
            >
              {{ play: 'Play', fix: 'Fix notes', sheet: 'Sheet' }[t]}
            </button>
          ))}
        </nav>

        <main className="flex-1 space-y-5 px-4 pb-32">
          {score.notes.length === 0 && (
            <p className="rounded-xl bg-glow-400/10 p-4 text-sm leading-relaxed text-glow-300 ring-1 ring-glow-400/25">
              Nothing readable on that page. {score.diagnostics.join(' ')} Try again with
              more light, the page flat, and the music filling the frame.
            </p>
          )}

          {tab === 'sheet' ? (
            <SheetView score={score} image={image} position={getPosition} showBoxes />
          ) : (
            <PianoRoll
              score={score}
              position={getPosition}
              selectedId={selected}
              loop={practice.loop}
              onSelect={(note) => setSelected(note?.id ?? null)}
              onSeek={(beat) => {
                ensurePlayer().seek(beat)
                pausedBeat.current = beat
              }}
            />
          )}

          {tab === 'fix' ? (
            <>
              <NoteEditor
                score={score}
                note={selectedNote}
                onChange={(patch) => selected && edit(updateNote(score, selected, patch))}
                onNudge={(semitones) => selected && edit(nudgePitch(score, selected, semitones))}
                onDelete={() => {
                  if (!selected) return
                  edit(removeNote(score, selected))
                  setSelected(null)
                }}
                onKeyChange={(fifths) => edit(rekey(score, fifths))}
                onTempoChange={(tempo) => edit({ ...score, tempo })}
                onPreview={(midi) => ensurePlayer().pluck(midi)}
              />
              <p className="text-xs leading-relaxed text-ink-400">
                Tip: tap a key on the keyboard below to add a note at the playhead.
              </p>
            </>
          ) : (
            <Transport
              score={score}
              playing={playing}
              measure={measure}
              practice={practice}
              onPractice={setPractice}
              onToggle={toggle}
              onRestart={() => {
                ensurePlayer().seek(practice.loop?.start ?? 0)
                pausedBeat.current = practice.loop?.start ?? 0
              }}
            />
          )}

          {score.diagnostics.length > 0 && score.notes.length > 0 && tab !== 'play' && (
            <p className="text-xs text-ink-400">
              {score.diagnostics.join(' ')}
              {score.confidence > 0 &&
                ` Read with ${Math.round(score.confidence * 100)}% confidence — anything
                  outlined in the roll is a note it was unsure of.`}
            </p>
          )}
        </main>

        <div className="sticky bottom-0 h-28 border-t border-ink-700 bg-ink-900 pb-[env(safe-area-inset-bottom)] sm:h-32">
          <Keyboard
            low={range.low}
            high={range.high}
            sounding={sounding}
            onPress={(midi) => {
              const player = ensurePlayer()
              player.pluck(midi)
              if (tab === 'fix') {
                const at = Math.round(getPosition() * 4) / 4
                const next = addNote(score, midi, Math.max(0, at), midi < 60 ? 'left' : 'right')
                edit(next)
                setSelected(next.notes[next.notes.length - 1]?.id ?? null)
              }
            }}
          />
        </div>
      </div>
    )
  }

  return (
    <>
      {error && (
        <div className="mx-auto max-w-2xl px-5 pt-5">
          <p className="rounded-xl bg-red-500/12 p-4 text-sm text-red-300 ring-1 ring-red-500/25">
            {error}
          </p>
        </div>
      )}
      <Home
        library={library}
        onScan={() => setScreen('camera')}
        onOpen={openScore}
        onDelete={(id) => setLibrary(deletePiece(id))}
      />
    </>
  )
}

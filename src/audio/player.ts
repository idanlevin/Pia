/**
 * Transport. Web Audio needs notes scheduled slightly ahead of time to play evenly, so
 * a timer wakes every 25 ms and books everything due in the next 150 ms. The playhead
 * the UI draws is computed from the audio clock rather than counted in the timer, so
 * the highlight cannot drift away from the sound.
 */

import type { Hand, Note } from '../lib/types'
import { Piano, type Voice } from './piano'

const LOOKAHEAD = 0.15
const TICK_MS = 25

export interface PlayerOptions {
  onStop?: () => void
}

export interface LoopRange {
  start: number
  end: number
}

export class Player {
  private piano: Piano
  private notes: Note[] = []
  private timer: number | null = null
  private cursor = 0
  private originBeat = 0
  private originTime = 0
  private clickBeat = 0
  /** Notes booked into the look-ahead window, so a pause can damp them. */
  private live: Voice[] = []

  /** Quarter notes per minute. */
  tempo = 84
  loop: LoopRange | null = null
  muted: Partial<Record<Hand, boolean>> = {}
  metronome = false
  beatsPerMeasure = 4
  /** Beats of clicks before the music starts. */
  countIn = 0
  private end = 0
  private options: PlayerOptions

  constructor(context: AudioContext, options: PlayerOptions = {}) {
    this.piano = new Piano(context)
    this.options = options
  }

  get context(): AudioContext {
    return this.piano.context
  }

  get playing(): boolean {
    return this.timer !== null
  }

  /** Current position in beats. Valid whether playing or paused. */
  get position(): number {
    if (!this.playing) return this.originBeat
    const elapsed = (this.context.currentTime - this.originTime) * (this.tempo / 60)
    return this.originBeat + elapsed
  }

  load(notes: Note[], end: number) {
    this.notes = [...notes].sort((a, b) => a.start - b.start)
    this.end = end
    this.cursor = 0
  }

  /** Preview a single note, for tapping keys or scrubbing the editor. */
  pluck(midi: number, seconds = 0.6) {
    const now = this.context.currentTime
    const voice = this.piano.play(midi, now, 0.75)
    voice.stop(now + seconds)
  }

  async start(fromBeat?: number) {
    if (this.context.state === 'suspended') await this.context.resume()
    if (this.playing) return

    const from = fromBeat ?? (this.position >= this.end - 1e-6 ? this.loop?.start ?? 0 : this.position)
    this.originBeat = from
    this.originTime = this.context.currentTime + 0.06 + this.countIn * (60 / this.tempo)
    this.cursor = this.notes.findIndex((n) => n.start >= from - 1e-6)
    if (this.cursor < 0) this.cursor = this.notes.length
    this.clickBeat = Math.ceil(from - 1e-6)

    for (let i = 0; i < this.countIn; i++) {
      const at = this.originTime - (this.countIn - i) * (60 / this.tempo)
      this.piano.click(at, i === 0)
    }

    this.live = []
    this.timer = window.setInterval(() => this.schedule(), TICK_MS)
    this.schedule()
  }

  pause() {
    if (!this.playing) return
    const at = this.position
    window.clearInterval(this.timer!)
    this.timer = null
    this.originBeat = Math.min(at, this.end)
    this.damp()
  }

  /** Release everything still ringing, including notes already booked ahead. */
  private damp() {
    const now = this.context.currentTime
    for (const voice of this.live) voice.stop(now)
    this.live = []
  }

  stop() {
    if (this.timer !== null) window.clearInterval(this.timer)
    this.timer = null
    this.damp()
    this.seek(this.loop?.start ?? 0)
    this.options.onStop?.()
  }

  seek(beat: number) {
    const wasPlaying = this.playing
    if (wasPlaying) {
      window.clearInterval(this.timer!)
      this.timer = null
      this.damp()
    }
    this.originBeat = Math.max(0, Math.min(beat, this.end))
    if (wasPlaying) void this.start(this.originBeat)
  }

  private beatToTime(beat: number): number {
    return this.originTime + (beat - this.originBeat) * (60 / this.tempo)
  }

  private schedule() {
    const horizon = this.context.currentTime + LOOKAHEAD
    const secondsPerBeat = 60 / this.tempo
    const limit = this.loop ? this.loop.end : this.end

    while (this.cursor < this.notes.length) {
      const note = this.notes[this.cursor]
      if (note.start >= limit) break
      const when = this.beatToTime(note.start)
      if (when > horizon) break
      this.cursor++
      if (this.muted[note.hand]) continue
      const voice = this.piano.play(note.midi, when, note.hand === 'left' ? 0.62 : 0.78)
      const until = when + Math.max(0.12, note.duration * secondsPerBeat * 0.94)
      voice.stop(until)
      this.live.push(voice)
    }

    if (this.live.length > 96) this.live = this.live.slice(-64)

    if (this.metronome) {
      while (this.beatToTime(this.clickBeat) <= horizon && this.clickBeat < limit) {
        this.piano.click(
          this.beatToTime(this.clickBeat),
          this.clickBeat % this.beatsPerMeasure === 0,
        )
        this.clickBeat++
      }
    }

    const reachedEnd =
      this.cursor >= this.notes.length || this.notes[this.cursor].start >= limit
    if (!reachedEnd || this.beatToTime(limit) > horizon) return

    if (this.loop) {
      // Re-anchor the clock to the top of the loop and rewind the cursor.
      this.originTime = this.beatToTime(this.loop.end)
      this.originBeat = this.loop.start
      this.clickBeat = Math.ceil(this.loop.start - 1e-6)
      this.cursor = this.notes.findIndex((n) => n.start >= this.loop!.start - 1e-6)
      if (this.cursor < 0) this.cursor = this.notes.length
      return
    }

    // Let the last chord ring before declaring the piece over.
    const tail = this.beatToTime(this.end) + 0.35
    if (this.context.currentTime >= tail) this.stop()
  }
}

/** Which notes are sounding at a given beat — what the keyboard lights up. */
export function soundingAt(notes: Note[], beat: number): Note[] {
  return notes.filter((n) => beat >= n.start - 1e-6 && beat < n.start + n.duration)
}

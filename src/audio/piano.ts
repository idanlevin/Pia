/**
 * A synthesized piano.
 *
 * Sampled pianos are the obvious way to get a good tone, and they cost 5-50 MB — which
 * would break the promise that you open the page and hear music. So the note is built
 * instead: a stack of partials stretched by string inharmonicity, each decaying faster
 * than the last, over a filtered noise burst standing in for the hammer. It is not a
 * Steinway, but it starts on the first tap and it is recognisably a piano.
 */

import { midiToFreq } from '../lib/music'

/** Real strings are stiff, so their partials run sharp of whole multiples. */
const INHARMONICITY = 0.00035
const PARTIALS = 7

export interface Voice {
  stop: (at: number) => void
}

export class Piano {
  readonly context: AudioContext
  private out: GainNode
  private noise: AudioBuffer

  constructor(context: AudioContext) {
    this.context = context

    const master = context.createGain()
    master.gain.value = 0.5

    // A gentle limiter: a ten-note chord should not clip.
    const comp = context.createDynamicsCompressor()
    comp.threshold.value = -18
    comp.knee.value = 24
    comp.ratio.value = 3
    comp.attack.value = 0.004
    comp.release.value = 0.18

    const reverb = context.createConvolver()
    reverb.buffer = makeRoom(context, 1.7)
    const wet = context.createGain()
    wet.gain.value = 0.16
    const dry = context.createGain()
    dry.gain.value = 0.9

    this.out = context.createGain()
    this.out.connect(dry)
    this.out.connect(reverb)
    reverb.connect(wet)
    dry.connect(comp)
    wet.connect(comp)
    comp.connect(master)
    master.connect(context.destination)

    this.noise = makeNoise(context)
  }

  /** Start a note at `when`; the returned handle releases it. */
  play(midi: number, when: number, velocity = 0.8): Voice {
    const ctx = this.context
    const f0 = midiToFreq(midi)
    const bright = Math.min(1, Math.max(0.25, 1.1 - (midi - 21) / 120))

    const note = ctx.createGain()
    note.gain.value = velocity
    note.connect(this.out)

    // Bass notes ring for the best part of a minute; the top octave dies in seconds.
    const decay = 1.2 + 26 * Math.pow(2, -(midi - 21) / 16)
    const partials: GainNode[] = []

    for (let n = 1; n <= PARTIALS; n++) {
      const ratio = n * Math.sqrt(1 + INHARMONICITY * n * n)
      const freq = f0 * ratio
      if (freq > ctx.sampleRate / 2.2) break

      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = freq
      // A touch of detune keeps the three strings of a unison from sounding like one.
      osc.detune.value = (n === 1 ? 0 : (n % 2 ? 1 : -1) * 1.5) * bright

      const gain = ctx.createGain()
      const level = (velocity * Math.pow(n, -1.6) * (n === 1 ? 1 : bright)) / 1.6
      const partialDecay = decay / Math.pow(n, 0.62)

      gain.gain.setValueAtTime(0, when)
      gain.gain.linearRampToValueAtTime(level, when + 0.004)
      gain.gain.setTargetAtTime(0, when + 0.004, partialDecay / 4)

      osc.connect(gain)
      gain.connect(note)
      osc.start(when)
      osc.stop(when + decay + 0.4)
      partials.push(gain)
    }

    // The hammer: a very short filtered noise burst, louder the harder the strike.
    const hammer = ctx.createBufferSource()
    hammer.buffer = this.noise
    const hammerFilter = ctx.createBiquadFilter()
    hammerFilter.type = 'bandpass'
    hammerFilter.frequency.value = Math.min(f0 * 4, 5200)
    hammerFilter.Q.value = 0.7
    const hammerGain = ctx.createGain()
    hammerGain.gain.setValueAtTime(velocity * 0.09 * bright, when)
    hammerGain.gain.exponentialRampToValueAtTime(0.0001, when + 0.07)
    hammer.connect(hammerFilter)
    hammerFilter.connect(hammerGain)
    hammerGain.connect(note)
    hammer.start(when)
    hammer.stop(when + 0.1)

    return {
      stop: (at: number) => {
        // Lifting a key damps the string rather than cutting it dead.
        const t = Math.max(at, when + 0.03)
        for (const g of partials) {
          g.gain.cancelScheduledValues(t)
          g.gain.setTargetAtTime(0, t, 0.08)
        }
      },
    }
  }

  /** A wood-block click for the metronome. */
  click(when: number, accent: boolean) {
    const ctx = this.context
    const osc = ctx.createOscillator()
    osc.type = 'square'
    osc.frequency.value = accent ? 1600 : 1100
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(accent ? 0.13 : 0.07, when)
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.045)
    osc.connect(gain)
    gain.connect(this.out)
    osc.start(when)
    osc.stop(when + 0.06)
  }
}

/** Exponentially decaying noise: a small room, cheap and good enough behind a piano. */
function makeRoom(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds)
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate)
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel)
    for (let i = 0; i < length; i++) {
      const t = i / length
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.6)
    }
  }
  return buffer
}

function makeNoise(ctx: BaseAudioContext): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * 0.12)
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1
  return buffer
}

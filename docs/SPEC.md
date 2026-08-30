# Pia — Product Spec

**Point a phone at sheet music. Hear it play. Learn the piece.**

Pia is a zero-install, zero-signup, backend-free web app. You open a URL, point your
camera at a page of piano music, and a few seconds later the page is playing back as a
piano — with a keyboard showing you exactly which keys to press, at whatever tempo you
can keep up with.

---

## 1. Why

Beginners can read *notes*, slowly, one at a time. What they can't do is hear the piece
in their head — so they don't know what they're aiming for, and they can't tell when
they've played it wrong. Recordings of the exact arrangement in front of them usually
don't exist.

Pia turns any printed page into a playable, slow-downable, loopable reference in about
five seconds, with no account, no upload, and no app store.

## 2. Principles

1. **Time-to-music under 10 seconds.** From cold open to hearing sound. Everything else
   is secondary.
2. **No backend, ever.** The image never leaves the device. That's a privacy guarantee
   and a hosting story (a static bucket) at the same time.
3. **Wrong beats missing.** Optical music recognition on a phone photo will misread
   things. The app must always produce *something* playable and make it trivially
   editable, rather than failing.
4. **Teach, don't just play.** Tempo, looping, hands-separate practice and a lit-up
   keyboard are the actual product; playback is the hook.

## 3. Scope

### In scope (v1)
- Camera capture and image upload of printed piano sheet music.
- On-device optical music recognition (OMR): staves, clefs, noteheads, stems, beams,
  flags, accidentals, dots, rests, barlines.
- Grand-staff (two-hand) and single-staff scores; multiple systems per page.
- Playback through a synthesized piano with pedal-free sustain and reverb.
- Practice tools: tempo 25–200%, A/B loop, count-in, hands-separate, metronome.
- An 88-key keyboard that lights up in time, plus a piano-roll editor for corrections.
- A local library of scanned pieces (localStorage), export to MIDI.

### Out of scope (v1)
- Handwritten manuscript, tablature, multi-page stitching, repeats/voltas/D.S. jumps,
  dynamics and articulation as *audio* (they're read but not expressed), lyrics,
  more than two staves per system, listening to the user play.

## 4. User flow

```
Open URL ──► [Scan] ─┬─► Camera ──► capture ──► Analyzing… ──► Player
                     ├─► Upload photo ─────────────────────┘
                     └─► Try a demo ───────────────────────► Player

Player ─┬─► Play / tempo / loop / hands
        ├─► Fix a note (piano roll) ──► back to Play
        └─► Save to library / export MIDI
```

Nothing is gated. No sign-in, no paywall, no onboarding carousel.

## 5. Capabilities

| # | Capability | Detail |
|---|---|---|
| C1 | **Scan** | Rear camera at max resolution, framing guide, torch toggle, tap-to-capture. Falls back to file picker on desktop or when camera access is denied. |
| C2 | **Recognize** | Runs entirely in a Web Worker. Reports per-stage progress and a confidence score. |
| C3 | **Play** | Additive-synthesis piano with inharmonic partials, hammer transient, per-partial decay, and a generated convolution reverb. |
| C4 | **Follow** | 88-key keyboard highlights sounding notes; piano roll scrolls with a playhead; the source photo shows detection boxes so you can see what was read. |
| C5 | **Practice** | Tempo slider (25–200%), A/B loop by measure, count-in, metronome, mute left/right hand. |
| C6 | **Correct** | Piano-roll editing: select, nudge pitch, change length, delete, add. Global key signature, time signature and clef overrides. |
| C7 | **Keep** | Pieces persist in localStorage with a thumbnail. Export to a standard MIDI file. |
| C8 | **Work offline** | Installable PWA, cached app shell. After the first visit it works on a plane. |

## 6. Technology choices

| Layer | Choice | Why |
|---|---|---|
| Build | **Vite + TypeScript** | Fast, static output, no server component. |
| UI | **React 19 + Tailwind CSS v4** | Small, well-known, no component-library weight. |
| Capture | **MediaDevices `getUserMedia`** (`facingMode: environment`) | Native camera, no plugin. `<input type="file" capture>` fallback. |
| Vision | **Hand-written OMR on `ImageData`** in a **Web Worker** | A trained model would mean a multi-MB download and a GPU story. A classical pipeline (binarize → deskew → staff detect → staff removal → connected components → notehead/stem/beam analysis) is ~40 KB of code, starts instantly, and is fully debuggable. It handles clean printed music, which is what people photograph. |
| Audio | **Web Audio API**, synthesized | Sample libraries are 5–50 MB. A physically-informed additive piano is a few hundred bytes of code and starts on the first tap. |
| State | React state + `localStorage` | There is no server to sync with. |
| Hosting | **GitHub Pages** via Actions | Static files. Free. Matches "no backend". |

### Why not a neural OMR model?
Accuracy would be higher, but the download is 5–50 MB, cold start is seconds, and it
needs WebGPU/WASM fallbacks. That breaks principle 1 for a v1. The classical pipeline is
the honest trade: good on clean print, editable when wrong. A model can be added later
behind the same `recognize(ImageData) → Score` interface.

## 7. Recognition pipeline

```
ImageData
  └─ downscale to ≤1600px wide
  └─ grayscale → adaptive threshold (integral image, mean − C)   → binary
  └─ run-length modes                → staff line thickness, staff space
  └─ shear search ±6°                → deskew
  └─ row projection peaks            → staff lines → staves → systems (grand staff)
  └─ thin-run removal                → staff lines erased, stems/heads preserved
  └─ 8-connected labeling            → symbol blobs per staff
  └─ integral-image window scan      → noteheads (filled vs hollow, NMS)
  └─ neighbourhood probes            → stems, beams, flags, dots, accidentals
  └─ tall thin blobs                 → barlines → measures
  └─ blob geometry                   → rests
  └─ y-position + clef + key         → MIDI pitch
  └─ duration accumulation, reset at each barline, per staff
Score { staves, measures, notes[] }
```

Barlines are used as hard sync points, so a misread in one measure can't drift the rest
of the piece out of alignment between the hands.

## 8. Design

**Feel:** a dark, calm instrument panel — closer to a tuner or a DAW than to a
worksheet. Deep neutral background, one warm amber accent for "sounding now", one cool
accent for interactive controls. No skeuomorphic wood.

- **Mobile-first.** One thumb. Primary action is always a large button in the bottom
  third of the screen.
- **Type:** system UI stack, tight tracking on headings, tabular numerals for
  tempo/measure readouts.
- **Motion:** only where it carries information — the playhead, key highlights, the
  analysing progress. Nothing decorative that runs while music plays.
- **Colour as data:** amber = sounding, cyan = selected/editable, grey = idle. Left and
  right hand differ in lightness, not hue, so they stay distinguishable when colour-blind.
- **Accessibility:** full keyboard control of the transport (space = play/pause), visible
  focus rings, `prefers-reduced-motion` respected, all controls ≥44 px on touch.

## 9. Success metrics

- Time from first paint to first audible note (target: **< 10 s** including the scan).
- Share of scans that produce ≥ 8 recognised notes without an edit (target: **> 70%** on
  clean printed music, well-lit, page flat).
- Share of sessions that use tempo or loop (proxy for "actually practising").

## 10. Known limits

- Perspective distortion is only partly corrected — the page should be roughly flat and
  parallel to the sensor.
- Repeats, voltas, ties across barlines, tuplets, grace notes and multi-voice staves are
  not interpreted.
- Key signature detection is heuristic; a manual key selector is always available.
- Dynamics and articulation are not rendered in the audio.

## 11. Roadmap

1. **v1.1** — ties and repeats; tuplets; better key/time signature reading.
2. **v1.2** — multi-page capture with stitching; PDF import.
3. **v2** — optional WASM/ONNX notehead classifier loaded lazily, same interface.
4. **v2.1** — Web MIDI in: the app waits for you to play the right key before advancing.

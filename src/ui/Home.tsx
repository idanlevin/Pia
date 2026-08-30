/** The first screen. One obvious action, and something to listen to immediately. */

import { DEMOS } from '../lib/demo'
import type { Score, StoredPiece } from '../lib/types'

interface Props {
  library: StoredPiece[]
  onScan: () => void
  onOpen: (score: Score, image: string | null) => void
  onDelete: (id: string) => void
}

export function Home({ library, onScan, onOpen, onDelete }: Props) {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col px-5 pt-14 pb-[max(2rem,env(safe-area-inset-bottom))]">
      <header className="mb-10">
        <h1 className="text-5xl font-semibold tracking-tight">Pia</h1>
        <p className="mt-3 max-w-md text-[15px] leading-relaxed text-ink-300">
          Point your camera at a page of piano music and hear it played back. Slow it
          down, loop the bar you keep fluffing, and watch the keys light up.
        </p>
        <p className="mt-3 text-sm text-ink-400">
          Everything happens on your phone. No account, and the photo is never uploaded.
        </p>
      </header>

      <button
        onClick={onScan}
        className="flex w-full items-center justify-center gap-3 rounded-2xl bg-glow-400 py-5 text-lg font-semibold text-ink-950 transition active:scale-[0.99]"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M3 8V5.5A1.5 1.5 0 0 1 4.5 4H7m10 0h2.5A1.5 1.5 0 0 1 21 5.5V8m0 8v2.5a1.5 1.5 0 0 1-1.5 1.5H17M7 20H4.5A1.5 1.5 0 0 1 3 18.5V16"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <circle cx="12" cy="12" r="3.4" stroke="currentColor" strokeWidth="2" />
        </svg>
        Scan sheet music
      </button>

      <section className="mt-10">
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-ink-300 uppercase">
          Or hear one now
        </h2>
        <div className="grid gap-2">
          {DEMOS.map((demo) => (
            <button
              key={demo.id}
              onClick={() => onOpen(demo, null)}
              className="flex items-center justify-between rounded-xl bg-ink-850 px-4 py-4 text-left ring-1 ring-ink-700 transition hover:bg-ink-800"
            >
              <span>
                <span className="block font-medium">{demo.title}</span>
                <span className="tabular text-sm text-ink-400">
                  {demo.measures.length} bars · {demo.tempo} bpm
                </span>
              </span>
              <span className="text-glow-400" aria-hidden>
                ▶
              </span>
            </button>
          ))}
        </div>
      </section>

      {library.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-sm font-semibold tracking-wide text-ink-300 uppercase">
            Your scans
          </h2>
          <div className="grid gap-2">
            {library.map((piece) => (
              <div
                key={piece.id}
                className="flex items-center gap-3 rounded-xl bg-ink-850 p-2 pr-3 ring-1 ring-ink-700"
              >
                <button
                  onClick={() => onOpen(piece.score, piece.thumbnail)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <img
                    src={piece.thumbnail}
                    alt=""
                    className="h-14 w-20 shrink-0 rounded-lg bg-white object-cover"
                  />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{piece.title}</span>
                    <span className="tabular text-sm text-ink-400">
                      {piece.score.notes.length} notes ·{' '}
                      {new Date(piece.createdAt).toLocaleDateString()}
                    </span>
                  </span>
                </button>
                <button
                  onClick={() => onDelete(piece.id)}
                  aria-label={`Delete ${piece.title}`}
                  className="h-11 w-11 shrink-0 rounded-lg text-ink-400 hover:text-ink-100"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <p className="mt-auto pt-12 text-xs leading-relaxed text-ink-400">
        Works best on clean printed music, well lit, with the page flat and filling the
        frame. Handwriting and heavily ornamented scores are beyond it — but anything it
        gets wrong, you can fix by tapping.
      </p>
    </div>
  )
}

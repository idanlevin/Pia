/**
 * Capture. The rear camera when we can get it, a file picker when we cannot —
 * desktop browsers, denied permissions, and iOS in a few situations all end up there,
 * so the fallback is a first-class path rather than an error state.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

interface Props {
  onCapture: (image: ImageData) => void
  onCancel: () => void
}

/** Not in lib.dom yet, but widely implemented on phones. */
type TorchConstraint = MediaTrackConstraintSet & { torch?: boolean }

export function Scanner({ onCapture, onCancel }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [torch, setTorch] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false

    const open = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('This browser has no camera access. Pick a photo instead.')
        return
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 2560 },
            height: { ideal: 1920 },
          },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play().catch(() => {})
        }
        const track = stream.getVideoTracks()[0]
        const caps = track.getCapabilities?.() as (MediaTrackCapabilities & { torch?: boolean }) | undefined
        setTorch(caps?.torch ? false : null)
        setReady(true)
      } catch {
        setError('No camera available. Pick a photo of the music instead.')
      }
    }

    void open()
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [])

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track || torch === null) return
    try {
      await track.applyConstraints({ advanced: [{ torch: !torch } as TorchConstraint] })
      setTorch(!torch)
    } catch {
      setTorch(null)
    }
  }

  const shoot = useCallback(() => {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return
    ctx.drawImage(video, 0, 0)
    onCapture(ctx.getImageData(0, 0, canvas.width, canvas.height))
  }, [onCapture])

  const pick = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const image = new Image()
    image.onload = () => {
      const canvas = document.createElement('canvas')
      // A 12-megapixel photo is far more than the recogniser needs, and decoding it
      // at full size is the slowest thing that would happen on the main thread.
      const scale = Math.min(1, 2400 / Math.max(image.width, image.height))
      canvas.width = Math.round(image.width * scale)
      canvas.height = Math.round(image.height * scale)
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) return
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(image.src)
      onCapture(ctx.getImageData(0, 0, canvas.width, canvas.height))
    }
    image.src = URL.createObjectURL(file)
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-ink-950">
      <div className="relative flex-1 overflow-hidden">
        <video
          ref={videoRef}
          playsInline
          muted
          className="absolute inset-0 h-full w-full object-cover"
        />

        {/* A frame to aim with: fill it with one system and keep the page flat. */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-5">
          <div className="h-2/3 w-full max-w-3xl rounded-xl border-2 border-dashed border-white/35">
            <div className="mt-3 text-center text-xs font-medium text-white/70 drop-shadow">
              Fill the frame with the music. Hold the page flat.
            </div>
          </div>
        </div>

        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-ink-950 p-8 text-center">
            <p className="max-w-xs text-sm text-ink-300">{error}</p>
            <button
              onClick={() => fileRef.current?.click()}
              className="rounded-full bg-sky-ui px-6 py-3 font-semibold text-ink-950"
            >
              Choose a photo
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-4 px-6 pt-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <button
          onClick={onCancel}
          className="min-h-11 min-w-11 rounded-full px-4 text-sm text-ink-300"
        >
          Cancel
        </button>

        <button
          onClick={shoot}
          disabled={!ready}
          aria-label="Take the photo"
          className="h-[72px] w-[72px] rounded-full border-4 border-white/85 bg-white/20 transition active:scale-95 disabled:opacity-40"
        >
          <span className="mx-auto block h-14 w-14 rounded-full bg-white" />
        </button>

        <div className="flex min-w-11 justify-end gap-2">
          {torch !== null && (
            <button
              onClick={toggleTorch}
              aria-pressed={torch}
              className={`min-h-11 rounded-full px-3 text-sm ${torch ? 'bg-glow-400 text-ink-950' : 'text-ink-300'}`}
            >
              Light
            </button>
          )}
          <button
            onClick={() => fileRef.current?.click()}
            className="min-h-11 rounded-full px-3 text-sm text-ink-300"
          >
            Photo
          </button>
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={pick}
        className="hidden"
      />
    </div>
  )
}

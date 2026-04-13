"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Image from "next/image"
import styles from "./VoiceInput.module.scss"

type VoiceInputProps = {
  onSend: (blob: Blob) => void | Promise<void>
  disabled?: boolean
  /** Вбудовано в один рядок із полем введення (без окремої картки) */
  embedded?: boolean
  onRecordingActivity?: (active: boolean) => void
}

/** Ліміт запису: 1 хвилина */
export const MAX_RECORDING_MS = 60_000
const MAX_SECONDS = 60

function pickAudioMimeType(): string {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]
  for (const mime of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(mime)) {
      return mime
    }
  }
  return ""
}

function readCssVar(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

type RecordingWaveformProps = {
  stream: MediaStream
}

function RecordingWaveform({ stream }: RecordingWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number>(0)
  const dimsRef = useRef({ w: 0, h: 44 })

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return

    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect
      if (cr && cr.width > 0) {
        dimsRef.current = { w: cr.width, h: Math.max(cr.height, 36) }
      }
    })
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [stream])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let audioCtx: AudioContext
    try {
      audioCtx = new AudioContext()
    } catch {
      return
    }

    void audioCtx.resume().catch(() => undefined)

    const source = audioCtx.createMediaStreamSource(stream)
    const analyser = audioCtx.createAnalyser()
    analyser.fftSize = 256
    analyser.smoothingTimeConstant = 0.82
    analyser.minDecibels = -85
    analyser.maxDecibels = -10
    source.connect(analyser)

    const bufferLength = analyser.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)
    const c = canvas.getContext("2d", { alpha: true })
    if (!c) {
      void audioCtx.close()
      return
    }

    const barCount = 40
    const step = Math.max(1, Math.floor(bufferLength / barCount))
    let lastW = 0
    let lastH = 0

    const draw = () => {
      if (!canvasRef.current || !c) return

      analyser.getByteFrequencyData(dataArray)

      const { w: rw, h: rh } = dimsRef.current
      const w = rw > 0 ? rw : 280
      const h = rh > 0 ? rh : 44
      const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1

      if (w < 4 || h < 4) {
        rafRef.current = requestAnimationFrame(draw)
        return
      }

      if (Math.abs(w - lastW) > 0.5 || Math.abs(h - lastH) > 0.5) {
        lastW = w
        lastH = h
        canvas.width = w * dpr
        canvas.height = h * dpr
        c.setTransform(dpr, 0, 0, dpr, 0, 0)
      }

      const accent = readCssVar("--accent", "#b8956a")
      const soft = readCssVar("--accent-soft", "rgba(180, 149, 106, 0.35)")
      const glow = readCssVar("--foreground", "#2e2c2c")

      c.clearRect(0, 0, w, h)

      const gap = 2
      const barW = (w - gap * (barCount - 1)) / barCount
      const mid = h * 0.5

      for (let i = 0; i < barCount; i++) {
        let sum = 0
        for (let j = 0; j < step; j++) {
          sum += dataArray[Math.min(i * step + j, bufferLength - 1)]
        }
        const norm = sum / step / 255
        const barH = Math.max(3, norm * h * 0.88 + 2)
        const x = i * (barW + gap)
        const y = mid - barH * 0.5

        const grd = c.createLinearGradient(x, y + barH, x, y)
        grd.addColorStop(0, soft)
        grd.addColorStop(0.55, accent)
        grd.addColorStop(1, glow)

        c.fillStyle = grd
        c.globalAlpha = 0.35 + norm * 0.65
        const radius = Math.min(4, barW * 0.45)
        c.beginPath()
        if (typeof c.roundRect === "function") {
          c.roundRect(x, y, barW, barH, radius)
        } else {
          c.rect(x, y, barW, barH)
        }
        c.fill()
      }
      c.globalAlpha = 1

      rafRef.current = requestAnimationFrame(draw)
    }

    draw()

    return () => {
      cancelAnimationFrame(rafRef.current)
      source.disconnect()
      analyser.disconnect()
      void audioCtx.close().catch(() => undefined)
    }
  }, [stream])

  return (
    <div ref={wrapRef} className={styles.waveCanvasWrap}>
      <canvas ref={canvasRef} className={styles.waveCanvas} aria-hidden />
    </div>
  )
}

export default function VoiceInput({
  onSend,
  disabled = false,
  embedded = false,
  onRecordingActivity,
}: VoiceInputProps) {
  const [isRecording, setIsRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [micError, setMicError] = useState<string | null>(null)
  const [recordingStream, setRecordingStream] = useState<MediaStream | null>(null)
  const [draftBlob, setDraftBlob] = useState<Blob | null>(null)
  const [draftUrl, setDraftUrl] = useState<string | null>(null)
  const [isSendingDraft, setIsSendingDraft] = useState(false)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const maxTimerRef = useRef<number | null>(null)
  const tickRef = useRef<number | null>(null)
  const disabledRef = useRef(disabled)
  const onSendRef = useRef(onSend)
  const onRecordingActivityRef = useRef(onRecordingActivity)
  useEffect(() => {
    disabledRef.current = disabled
    onSendRef.current = onSend
    onRecordingActivityRef.current = onRecordingActivity
  }, [disabled, onSend, onRecordingActivity])

  const clearTimers = useCallback(() => {
    if (maxTimerRef.current) {
      clearTimeout(maxTimerRef.current)
      maxTimerRef.current = null
    }
    if (tickRef.current) {
      clearInterval(tickRef.current)
      tickRef.current = null
    }
  }, [])

  const clearDraft = useCallback(() => {
    setDraftBlob(null)
    setDraftUrl((previous) => {
      if (previous) {
        URL.revokeObjectURL(previous)
      }
      return null
    })
  }, [])

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setRecordingStream(null)
  }, [])

  const finalizeRecording = useCallback(() => {
    const mr = mediaRecorderRef.current
    mediaRecorderRef.current = null
    clearTimers()
    setIsRecording(false)
    onRecordingActivityRef.current?.(false)
    setSeconds(0)
    setRecordingStream(null)

    if (!mr) {
      stopStream()
      return
    }

    if (mr.state !== "inactive") {
      try {
        mr.stop()
      } catch {
        stopStream()
      }
    } else {
      stopStream()
    }
  }, [clearTimers, stopStream])

  useEffect(() => {
    return () => {
      clearTimers()
      const mr = mediaRecorderRef.current
      if (mr && mr.state !== "inactive") {
        try {
          mr.stop()
        } catch {
          // ігноруємо
        }
      }
      mediaRecorderRef.current = null
      stopStream()
      clearDraft()
    }
  }, [clearDraft, clearTimers, stopStream])

  useEffect(() => {
    if (disabled && isRecording) {
      finalizeRecording()
    }
  }, [disabled, isRecording, finalizeRecording])

  const startRecording = useCallback(async () => {
    if (disabled || typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      return
    }

    setMicError(null)
    clearDraft()

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      setRecordingStream(stream)

      const mimeType = pickAudioMimeType()
      const options = mimeType ? { mimeType } : undefined
      const recorder = new MediaRecorder(stream, options)

      chunksRef.current = []
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      }

      recorder.onstop = () => {
        stopStream()
        const type = recorder.mimeType || mimeType || "audio/webm"
        const blob = new Blob(chunksRef.current, { type })
        chunksRef.current = []
        if (!disabledRef.current && blob.size > 0) {
          const nextUrl = URL.createObjectURL(blob)
          setDraftBlob(blob)
          setDraftUrl((previous) => {
            if (previous) {
              URL.revokeObjectURL(previous)
            }
            return nextUrl
          })
        }
      }

      mediaRecorderRef.current = recorder
      recorder.start(200)
      setIsRecording(true)
      onRecordingActivityRef.current?.(true)
      setSeconds(0)

      tickRef.current = window.setInterval(() => {
        setSeconds((previous) => Math.min(previous + 1, MAX_SECONDS))
      }, 1000)

      maxTimerRef.current = window.setTimeout(() => {
        finalizeRecording()
      }, MAX_RECORDING_MS)
    } catch {
      setMicError("Нет доступа к микрофону")
      stopStream()
    }
  }, [clearDraft, disabled, finalizeRecording, stopStream])

  const stopRecording = useCallback(() => {
    const mr = mediaRecorderRef.current
    clearTimers()
    setIsRecording(false)
    onRecordingActivityRef.current?.(false)
    setSeconds(0)
    setRecordingStream(null)

    if (mr && mr.state !== "inactive") {
      try {
        mr.stop()
      } catch {
        stopStream()
      }
    } else {
      stopStream()
    }
    mediaRecorderRef.current = null
  }, [clearTimers, stopStream])

  const sendDraft = useCallback(async () => {
    if (!draftBlob || disabled || isSendingDraft) return
    setIsSendingDraft(true)
    try {
      await Promise.resolve(onSendRef.current(draftBlob))
      clearDraft()
    } finally {
      setIsSendingDraft(false)
    }
  }, [clearDraft, disabled, draftBlob, isSendingDraft])

  const formatDuration = (totalSeconds: number) => {
    const m = Math.floor(totalSeconds / 60)
    const s = totalSeconds % 60
    return `${m}:${s.toString().padStart(2, "0")}`
  }

  const progress = Math.min(seconds / MAX_SECONDS, 1)
  const remaining = Math.max(0, MAX_SECONDS - seconds)

  const rootClass = embedded
    ? `${styles.voiceBarEmbedded} ${styles.voiceRoot}`
    : `${styles.voiceBar} ${styles.voiceRoot}`

  return (
    <div className={rootClass} aria-label="Голосовое сообщение" data-disabled={disabled ? "true" : undefined}>
      <div className={`${styles.recorderWrap} ${disabled ? styles.recorderDisabled : ""}`}>
        {!isRecording && !draftUrl ? (
          <button
            type="button"
            className={styles.recordStartBtn}
            onClick={() => void startRecording()}
            disabled={disabled}
          >
            <span className={styles.startBtnInner}>
              <Image src="/icon-micro.svg" alt="" width={22} height={22} className={styles.micIcon} />
              <span>Записать</span>
            </span>
          </button>
        ) : isRecording ? (
          <div className={styles.recordingPanel}>
            <div className={styles.waveSection}>
              {recordingStream ? <RecordingWaveform stream={recordingStream} /> : null}
              <div
                className={styles.timeProgressTrack}
                role="progressbar"
                aria-valuenow={seconds}
                aria-valuemin={0}
                aria-valuemax={MAX_SECONDS}
                aria-label={`Прошло ${seconds} секунд из ${MAX_SECONDS}`}
              >
                <div className={styles.timeProgressFill} style={{ width: `${progress * 100}%` }} />
              </div>
            </div>

            <div className={styles.recordingFooter}>
              <div className={styles.timePill}>
                <span className={styles.recDot} aria-hidden />
                <span className={styles.timeElapsed}>{formatDuration(seconds)}</span>
                <span className={styles.timeSep}>/</span>
                <span className={styles.timeCap}>1:00</span>
              </div>
              <span className={styles.timeRemaining}>
                {remaining > 0 ? `ещё ${formatDuration(remaining)}` : "лимит"}
              </span>
              <button
                type="button"
                className={styles.recordStopBtn}
                onClick={stopRecording}
                disabled={disabled}
              >
                <span className={styles.stopIcon} aria-hidden />
                Остановить
              </button>
            </div>
          </div>
        ) : (
          <div className={styles.previewPanel}>
            <audio className={styles.previewAudio} controls src={draftUrl ?? undefined} preload="metadata" />
            <div className={styles.previewActions}>
              <button
                type="button"
                className={styles.previewDiscardBtn}
                onClick={clearDraft}
                disabled={disabled || isSendingDraft}
              >
                Удалить
              </button>
              <button
                type="button"
                className={styles.previewSendBtn}
                onClick={() => void sendDraft()}
                disabled={disabled || isSendingDraft}
              >
                {isSendingDraft ? "Отправка..." : "Отправить"}
              </button>
            </div>
          </div>
        )}
        {micError ? <span className={styles.micError}>{micError}</span> : null}
      </div>
    </div>
  )
}

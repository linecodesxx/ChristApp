"use client"

import { useCallback, useEffect, useRef, useState } from "react"

type UseVideoRecorderOptions = {
  uploadUrl: string
  getAuthToken: () => Promise<string | null>
  onUploaded: (secureUrl: string) => void | Promise<void>
  onError?: (message: string) => void
}

type UseVideoRecorderResult = {
  start: () => Promise<void>
  stop: () => Promise<void>
  closeScene: () => Promise<void>
  switchCamera: () => Promise<void>
  isRecording: boolean
  isUploading: boolean
  isSceneOpen: boolean
  elapsedSeconds: number
  maxDurationSeconds: number
  facingMode: "user" | "environment"
  previewVideoRef: React.MutableRefObject<HTMLVideoElement | null>
}

const MAX_VIDEO_NOTE_SECONDS = 60

const VIDEO_NOTE_MIME_ALLOW = new Set(["video/webm", "video/mp4", "video/quicktime"])

function pickVideoMimeType(): string {
  const candidates = [
    "video/mp4;codecs=h264,aac",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ]

  for (const mime of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(mime)) {
      return mime
    }
  }

  return ""
}

export function useVideoRecorder({
  uploadUrl,
  getAuthToken,
  onUploaded,
  onError,
}: UseVideoRecorderOptions): UseVideoRecorderResult {
  const [isRecording, setIsRecording] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [isSceneOpen, setIsSceneOpen] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user")

  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const previewVideoRef = useRef<HTMLVideoElement | null>(null)
  const startedAtRef = useRef<number | null>(null)

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (previewVideoRef.current) {
      previewVideoRef.current.srcObject = null
    }
  }, [])

  const startPreviewStream = useCallback(
    async (nextFacingMode: "user" | "environment") => {
      stopStream()
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 480 },
          height: { ideal: 480 },
          aspectRatio: { ideal: 1 },
          facingMode: nextFacingMode,
        },
        audio: true,
      })

      streamRef.current = stream
      const previewVideo = previewVideoRef.current
      if (previewVideo) {
        previewVideo.srcObject = stream
        await previewVideo.play().catch(() => undefined)
      }
    },
    [stopStream],
  )

  const uploadBlob = useCallback(
    async (blob: Blob) => {
      const token = await getAuthToken()
      if (!token) {
        throw new Error("Нет токена авторизации")
      }

      const sourceMime = blob.type.split(";")[0].trim().toLowerCase()
      const normalizedMime = VIDEO_NOTE_MIME_ALLOW.has(sourceMime) ? sourceMime : "video/webm"
      const ext = normalizedMime.includes("mp4") ? "mp4" : normalizedMime.includes("quicktime") ? "mov" : "webm"

      // Всегда создаём File с явным чистым MIME без codec-суффиксов,
      // иначе Multer может передать «video/webm;codecs=vp9,opus» в file.mimetype
      // и NestJS FileTypeValidator / ручная проверка завалится.
      const fileToUpload = new File([blob], `video-note.${ext}`, { type: normalizedMime })

      const formData = new FormData()
      formData.append("file", fileToUpload)

      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      })

      if (!response.ok) {
        const reason = (await response.text()).trim() || `HTTP ${response.status}`
        throw new Error(reason)
      }

      const payload = (await response.json()) as { secure_url?: string }
      const secureUrl = payload?.secure_url?.trim()
      if (!secureUrl) {
        throw new Error("Сервер не вернул secure_url")
      }

      await onUploaded(secureUrl)
    },
    [getAuthToken, onUploaded, uploadUrl],
  )

  const start = useCallback(async () => {
    if (recorderRef.current || isUploading) {
      return
    }

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      onError?.("Запись видео не поддерживается на этом устройстве")
      return
    }

    try {
      setIsSceneOpen(true)
      await startPreviewStream(facingMode)

      const stream = streamRef.current
      if (!stream) {
        throw new Error("Не удалось запустить превью камеры")
      }
      const mimeType = pickVideoMimeType()
      const options = mimeType ? { mimeType } : undefined
      const recorder = new MediaRecorder(stream, options)

      chunksRef.current = []
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      }

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mimeType || "video/webm" })
        chunksRef.current = []
        setIsRecording(false)
        startedAtRef.current = null
        setElapsedSeconds(0)

        if (!blob.size) {
          stopStream()
          setIsSceneOpen(false)
          return
        }

        setIsUploading(true)
        void uploadBlob(blob)
          .catch((error: unknown) => {
            const message = error instanceof Error ? error.message : "Не удалось отправить видео"
            onError?.(message)
          })
          .finally(() => {
            stopStream()
            setIsSceneOpen(false)
            setIsUploading(false)
          })
      }

      recorderRef.current = recorder
      recorder.start(160)
      startedAtRef.current = Date.now()
      setElapsedSeconds(0)
      setIsRecording(true)
    } catch {
      stopStream()
      setIsSceneOpen(false)
      onError?.("Нет доступа к камере или микрофону")
    }
  }, [facingMode, isUploading, onError, startPreviewStream, stopStream, uploadBlob])

  const stop = useCallback(async () => {
    const recorder = recorderRef.current
    recorderRef.current = null

    if (!recorder) {
      stopStream()
      setIsRecording(false)
      startedAtRef.current = null
      setElapsedSeconds(0)
      return
    }

    if (recorder.state !== "inactive") {
      recorder.stop()
    } else {
      stopStream()
      setIsRecording(false)
      startedAtRef.current = null
      setElapsedSeconds(0)
    }
  }, [stopStream])

  const closeScene = useCallback(async () => {
    if (isRecording) {
      await stop()
    } else {
      stopStream()
      setElapsedSeconds(0)
      startedAtRef.current = null
      setIsSceneOpen(false)
    }
  }, [isRecording, stop, stopStream])

  const switchCamera = useCallback(async () => {
    if (isRecording) {
      onError?.("Камеру можно перевернуть до начала записи")
      return
    }
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      onError?.("Камера недоступна на этом устройстве")
      return
    }

    const nextFacingMode = facingMode === "user" ? "environment" : "user"
    try {
      await startPreviewStream(nextFacingMode)
      setFacingMode(nextFacingMode)
    } catch {
      onError?.("Не удалось переключить камеру")
    }
  }, [facingMode, isRecording, onError, startPreviewStream])

  useEffect(() => {
    if (!isRecording) {
      return
    }

    const intervalId = window.setInterval(() => {
      const startedAt = startedAtRef.current
      if (!startedAt) {
        return
      }

      const seconds = Math.floor((Date.now() - startedAt) / 1000)
      setElapsedSeconds(seconds)
      if (seconds >= MAX_VIDEO_NOTE_SECONDS) {
        void stop()
      }
    }, 200)

    return () => window.clearInterval(intervalId)
  }, [isRecording, stop])

  useEffect(() => {
    return () => {
      const recorder = recorderRef.current
      if (recorder && recorder.state !== "inactive") {
        recorder.stop()
      }
      recorderRef.current = null
      stopStream()
    }
  }, [stopStream])

  return {
    start,
    stop,
    closeScene,
    switchCamera,
    isRecording,
    isUploading,
    isSceneOpen,
    elapsedSeconds,
    maxDurationSeconds: MAX_VIDEO_NOTE_SECONDS,
    facingMode,
    previewVideoRef,
  }
}

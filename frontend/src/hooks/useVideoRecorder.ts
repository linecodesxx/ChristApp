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
  isRecording: boolean
  isUploading: boolean
}

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

  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }, [])

  const uploadBlob = useCallback(
    async (blob: Blob) => {
      const token = await getAuthToken()
      if (!token) {
        throw new Error("Нет токена авторизации")
      }

      const ext = blob.type.includes("webm") ? "webm" : "mp4"
      const file = new File([blob], `video-note.${ext}`, {
        type: blob.type || "video/webm",
      })

      const formData = new FormData()
      formData.append("file", file)

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
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 480 },
          height: { ideal: 480 },
          aspectRatio: { ideal: 1 },
          facingMode: "user",
        },
        audio: true,
      })

      streamRef.current = stream
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
        stopStream()
        setIsRecording(false)

        if (!blob.size) {
          return
        }

        setIsUploading(true)
        void uploadBlob(blob)
          .catch((error: unknown) => {
            const message = error instanceof Error ? error.message : "Не удалось отправить видео"
            onError?.(message)
          })
          .finally(() => {
            setIsUploading(false)
          })
      }

      recorderRef.current = recorder
      recorder.start(160)
      setIsRecording(true)
    } catch {
      stopStream()
      onError?.("Нет доступа к камере или микрофону")
    }
  }, [isUploading, onError, stopStream, uploadBlob])

  const stop = useCallback(async () => {
    const recorder = recorderRef.current
    recorderRef.current = null

    if (!recorder) {
      stopStream()
      setIsRecording(false)
      return
    }

    if (recorder.state !== "inactive") {
      recorder.stop()
    } else {
      stopStream()
      setIsRecording(false)
    }
  }, [stopStream])

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
    isRecording,
    isUploading,
  }
}

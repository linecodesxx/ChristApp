"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import AgoraRTC, { type IAgoraRTCClient, type IAgoraRTCRemoteUser, type IMicrophoneAudioTrack } from "agora-rtc-sdk-ng"
import { AnimatePresence, motion } from "framer-motion"
import { Mic, MicOff, Minus, PhoneOff, Volume2, VolumeX } from "lucide-react"
import AvatarWithFallback from "@/components/AvatarWithFallback/AvatarWithFallback"
import { ensureAccessToken } from "@/lib/authSession"
import { getInitials } from "@/lib/utils"
import { resolvePublicAvatarUrl } from "@/lib/avatarUrl"
import { apiFetch } from "@/lib/apiFetch"
import { getHttpApiBase } from "@/lib/apiBase"
import styles from "./CallScreen.module.scss"

type CallScreenProps = {
  isOpen: boolean
  isVisible?: boolean
  channelName: string | null
  peerName: string
  peerAvatarUrl?: string | null
  onClose: () => void
  onMinimize?: () => void
  onCallEnded?: (durationSeconds: number) => void
}

const HTTP_API = getHttpApiBase()
const AGORA_APP_ID = process.env.NEXT_PUBLIC_AGORA_APP_ID?.trim() ?? ""

function formatCallDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

export default function CallScreen({
  isOpen,
  isVisible = true,
  channelName,
  peerName,
  peerAvatarUrl,
  onClose,
  onMinimize,
  onCallEnded,
}: CallScreenProps) {
  const clientRef = useRef<IAgoraRTCClient | null>(null)
  const micTrackRef = useRef<IMicrophoneAudioTrack | null>(null)
  const remoteTracksRef = useRef<Map<string, IAgoraRTCRemoteUser["audioTrack"]>>(new Map())
  const speakingResetTimeoutRef = useRef<number | null>(null)
  const isJoiningRef = useRef(false)
  const isHangingUpRef = useRef(false)
  const isSpeakerOnRef = useRef(true)
  const onCloseRef = useRef(onClose)
  const onCallEndedRef = useRef(onCallEnded)
  const callStartTimeRef = useRef<number | null>(null)
  const [status, setStatus] = useState("Connecting")
  const [isMuted, setIsMuted] = useState(false)
  const [isSpeakerOn, setIsSpeakerOn] = useState(true)
  const [isPeerSpeaking, setIsPeerSpeaking] = useState(false)
  const [isHangingUp, setIsHangingUp] = useState(false)
  const [callDuration, setCallDuration] = useState(0)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    onCallEndedRef.current = onCallEnded
  }, [onCallEnded])

  // Call duration timer — starts when connected
  useEffect(() => {
    if (status !== "Connected") return
    if (!callStartTimeRef.current) {
      callStartTimeRef.current = Date.now()
    }
    const tickId = window.setInterval(() => {
      const start = callStartTimeRef.current
      if (start) setCallDuration(Math.floor((Date.now() - start) / 1000))
    }, 1000)
    return () => window.clearInterval(tickId)
  }, [status])

  const cleanupCall = useCallback(async () => {
    if (speakingResetTimeoutRef.current) {
      window.clearTimeout(speakingResetTimeoutRef.current)
      speakingResetTimeoutRef.current = null
    }

    const micTrack = micTrackRef.current
    if (micTrack) {
      micTrack.stop()
      micTrack.close()
      micTrackRef.current = null
    }

    remoteTracksRef.current.forEach((track) => {
      track?.stop()
    })
    remoteTracksRef.current.clear()

    const client = clientRef.current
    if (client) {
      clientRef.current = null
      try {
        await client.leave()
      } catch {
        // ignore leave errors during teardown
      }
      client.removeAllListeners()
    }
  }, [])

  useEffect(() => {
    if (!isOpen || !channelName) {
      return
    }

    let active = true

    const startCall = async () => {
      if (isJoiningRef.current) return
      isJoiningRef.current = true

      if (!AGORA_APP_ID) {
        setStatus("Missing NEXT_PUBLIC_AGORA_APP_ID")
        return
      }

      const token = await ensureAccessToken().catch(() => null)
      if (!token) {
        setStatus("No auth token")
        return
      }

      try {
        setStatus("Connecting")
        const response = await apiFetch(`${HTTP_API}/calls/token?channelName=${encodeURIComponent(channelName)}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })
        if (!response.ok) {
          setStatus("Token request failed")
          return
        }

        const payload = (await response.json()) as { token?: string; uid?: number; channelName?: string }
        if (!payload?.token || typeof payload.uid !== "number" || !payload.channelName) {
          setStatus("Invalid token payload")
          return
        }

        const joinUid = payload.uid
        const joinChannelName = payload.channelName

        // Voice-only call flow, using a supported client codec.
        const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" })
        clientRef.current = client

        client.on("user-published", async (user, mediaType) => {
          if (mediaType !== "audio") {
            return
          }
          await client.subscribe(user, mediaType)
          if (user.audioTrack) {
            user.audioTrack.play()
            user.audioTrack.setVolume(isSpeakerOnRef.current ? 100 : 0)
            remoteTracksRef.current.set(String(user.uid), user.audioTrack)
            setStatus("Connected")
          }
        })

        client.on("user-unpublished", (user, mediaType) => {
          if (mediaType === "audio") {
            remoteTracksRef.current.get(String(user.uid))?.stop()
            remoteTracksRef.current.delete(String(user.uid))
          }
        })

        client.on("user-left", () => {
          const start = callStartTimeRef.current
          const elapsed = start ? Math.floor((Date.now() - start) / 1000) : 0
          void cleanupCall()
          onCallEndedRef.current?.(elapsed)
          onCloseRef.current()
        })

        client.enableAudioVolumeIndicator()
        client.on("volume-indicator", (volumes) => {
          const isRemoteSpeaking = volumes.some((item) => Number(item.uid) !== joinUid && item.level > 6)
          if (!isRemoteSpeaking) return
          setIsPeerSpeaking(true)
          if (speakingResetTimeoutRef.current) {
            window.clearTimeout(speakingResetTimeoutRef.current)
          }
          speakingResetTimeoutRef.current = window.setTimeout(() => {
            setIsPeerSpeaking(false)
          }, 280)
        })

        try {
          await client.join(AGORA_APP_ID, joinChannelName, payload.token, joinUid)
        } catch (error) {
          console.error("Agora join failed", {
            error,
            appId: AGORA_APP_ID,
            channelName: joinChannelName,
            uid: joinUid,
          })
          throw error
        }
        const micTrack = await AgoraRTC.createMicrophoneAudioTrack({
          encoderConfig: "speech_standard",
        })
        micTrackRef.current = micTrack
        await client.publish([micTrack])
        if (active) {
          setStatus("Connected")
        }
      } catch (error) {
        console.error("Call setup failed", error)
        setStatus("Call connection failed")
      } finally {
        isJoiningRef.current = false
      }
    }

    void startCall()

    return () => {
      active = false
      isJoiningRef.current = false
      void cleanupCall()
      callStartTimeRef.current = null
      setCallDuration(0)
      setIsPeerSpeaking(false)
      setIsMuted(false)
      setIsSpeakerOn(true)
      setStatus("Connecting")
    }
  }, [channelName, cleanupCall, isOpen])

  const toggleMute = useCallback(async () => {
    const nextMuted = !isMuted
    setIsMuted(nextMuted)
    const micTrack = micTrackRef.current
    if (micTrack) {
      await micTrack.setEnabled(!nextMuted)
    }
  }, [isMuted])

  const toggleSpeaker = useCallback(() => {
    setIsSpeakerOn((prev) => {
      const next = !prev
      isSpeakerOnRef.current = next
      remoteTracksRef.current.forEach((track) => {
        track?.setVolume(next ? 100 : 0)
      })
      return next
    })
  }, [])

  const hangup = useCallback(async () => {
    if (isHangingUpRef.current) return
    isHangingUpRef.current = true
    setIsHangingUp(true)
    try {
      const start = callStartTimeRef.current
      const elapsed = start ? Math.floor((Date.now() - start) / 1000) : 0
      await cleanupCall()
      onCallEndedRef.current?.(elapsed)
      onClose()
    } finally {
      isHangingUpRef.current = false
      setIsHangingUp(false)
    }
  }, [cleanupCall, onClose])

  if (typeof window === "undefined") {
    return null
  }

  return (
    <AnimatePresence>
      {isOpen && isVisible ? (
        <motion.div
          className={styles.overlay}
          initial={{ opacity: 0, backdropFilter: "blur(2px)" }}
          animate={{ opacity: 1, backdropFilter: "blur(20px)" }}
          exit={{ opacity: 0, backdropFilter: "blur(2px)" }}
          transition={{ duration: 0.28, ease: "easeOut" }}
        >
          <button
            type="button"
            className={styles.minimizeButton}
            onClick={onMinimize}
            aria-label="Hide call"
            title="Hide call"
          >
            <Minus size={20} />
          </button>
          <div className={styles.peerName}>{peerName}</div>
          <div className={styles.status}>
            {status === "Connected" ? formatCallDuration(callDuration) : status}
          </div>

          <div className={styles.avatarWrap}>
            <AnimatePresence>
              {isPeerSpeaking ? (
                <motion.div
                  className={styles.avatarPulse}
                  initial={{ opacity: 0.35, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1.05 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.24 }}
                />
              ) : null}
            </AnimatePresence>
            <div className={styles.avatar}>
              <AvatarWithFallback
                src={resolvePublicAvatarUrl(peerAvatarUrl)}
                initials={getInitials(peerName)}
                colorSeed={peerName}
                width={186}
                height={186}
                fallbackClassName={styles.avatarFallback}
              />
            </div>
          </div>

          <div className={styles.actions}>
            <button
              type="button"
              onClick={() => void toggleMute()}
              className={`${styles.actionButton} ${isMuted ? styles.actionButtonMuted : ""}`}
              aria-label={isMuted ? "Unmute microphone" : "Mute microphone"}
            >
              {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
            </button>
            <button
              type="button"
              onClick={toggleSpeaker}
              className={`${styles.actionButton} ${!isSpeakerOn ? styles.actionButtonSpeakerOff : ""}`}
              aria-label={isSpeakerOn ? "Disable speaker" : "Enable speaker"}
            >
              {isSpeakerOn ? <Volume2 size={24} /> : <VolumeX size={24} />}
            </button>
            <button
              type="button"
              onClick={() => void hangup()}
              disabled={isHangingUp}
              className={`${styles.actionButton} ${styles.hangupButton}`}
            >
              <PhoneOff size={24} />
            </button>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

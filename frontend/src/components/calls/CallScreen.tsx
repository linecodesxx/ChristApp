"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import AgoraRTC, { type IAgoraRTCClient, type IAgoraRTCRemoteUser, type IMicrophoneAudioTrack } from "agora-rtc-sdk-ng"
import { AnimatePresence, motion } from "framer-motion"
import { Mic, MicOff, PhoneOff, Volume2, VolumeX } from "lucide-react"
import AvatarWithFallback from "@/components/AvatarWithFallback/AvatarWithFallback"
import { getAuthToken } from "@/lib/auth"
import { getInitials } from "@/lib/utils"
import { resolvePublicAvatarUrl } from "@/lib/avatarUrl"
import { apiFetch } from "@/lib/apiFetch"
import { getHttpApiBase } from "@/lib/apiBase"
import styles from "./CallScreen.module.scss"

type CallScreenProps = {
  isOpen: boolean
  channelName: string | null
  peerName: string
  peerAvatarUrl?: string | null
  onClose: () => void
}

const HTTP_API = getHttpApiBase()
const AGORA_APP_ID = process.env.NEXT_PUBLIC_AGORA_APP_ID?.trim() ?? ""

export default function CallScreen({ isOpen, channelName, peerName, peerAvatarUrl, onClose }: CallScreenProps) {
  const clientRef = useRef<IAgoraRTCClient | null>(null)
  const micTrackRef = useRef<IMicrophoneAudioTrack | null>(null)
  const remoteTracksRef = useRef<Map<string, IAgoraRTCRemoteUser["audioTrack"]>>(new Map())
  const speakingResetTimeoutRef = useRef<number | null>(null)
  const [status, setStatus] = useState("Connecting")
  const [isMuted, setIsMuted] = useState(false)
  const [isSpeakerOn, setIsSpeakerOn] = useState(true)
  const [isPeerSpeaking, setIsPeerSpeaking] = useState(false)

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
      try {
        await client.leave()
      } catch {
        // ignore leave errors during teardown
      }
      client.removeAllListeners()
      clientRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!isOpen || !channelName) {
      return
    }

    let active = true

    const startCall = async () => {
      if (!AGORA_APP_ID) {
        setStatus("Missing NEXT_PUBLIC_AGORA_APP_ID")
        return
      }

      const token = getAuthToken()
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

        const payload = (await response.json()) as { token?: string; uid?: number }
        if (!payload?.token || typeof payload.uid !== "number") {
          setStatus("Invalid token payload")
          return
        }

        // Voice-only profile: opus audio codec, microphone publish only.
        const client = AgoraRTC.createClient({ mode: "rtc", codec: "opus" })
        clientRef.current = client
        await client.setClientRole("host")

        client.on("user-published", async (user, mediaType) => {
          if (mediaType !== "audio") {
            return
          }
          await client.subscribe(user, mediaType)
          if (user.audioTrack) {
            user.audioTrack.play()
            user.audioTrack.setVolume(isSpeakerOn ? 100 : 0)
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
          void cleanupCall()
          onClose()
        })

        client.enableAudioVolumeIndicator()
        client.on("volume-indicator", (volumes) => {
          const isRemoteSpeaking = volumes.some((item) => Number(item.uid) !== payload.uid && item.level > 6)
          if (!isRemoteSpeaking) return
          setIsPeerSpeaking(true)
          if (speakingResetTimeoutRef.current) {
            window.clearTimeout(speakingResetTimeoutRef.current)
          }
          speakingResetTimeoutRef.current = window.setTimeout(() => {
            setIsPeerSpeaking(false)
          }, 280)
        })

        await client.join(AGORA_APP_ID, channelName, payload.token, payload.uid)
        const micTrack = await AgoraRTC.createMicrophoneAudioTrack({
          encoderConfig: "speech_standard",
        })
        micTrackRef.current = micTrack
        await client.publish([micTrack])
        if (active) {
          setStatus("Connected")
        }
      } catch {
        setStatus("Call connection failed")
      }
    }

    void startCall()

    return () => {
      active = false
      void cleanupCall()
      setIsPeerSpeaking(false)
      setIsMuted(false)
      setIsSpeakerOn(true)
      setStatus("Connecting")
    }
  }, [channelName, cleanupCall, isOpen, isSpeakerOn, onClose])

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
      remoteTracksRef.current.forEach((track) => {
        track?.setVolume(next ? 100 : 0)
      })
      return next
    })
  }, [])

  const hangup = useCallback(async () => {
    await cleanupCall()
    onClose()
  }, [cleanupCall, onClose])

  return (
    <AnimatePresence>
      {isOpen ? (
        <motion.div
          className={styles.overlay}
          initial={{ opacity: 0, backdropFilter: "blur(2px)" }}
          animate={{ opacity: 1, backdropFilter: "blur(20px)" }}
          exit={{ opacity: 0, backdropFilter: "blur(2px)" }}
          transition={{ duration: 0.28, ease: "easeOut" }}
        >
          <div className={styles.peerName}>{peerName}</div>
          <div className={styles.status}>{status}</div>

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
            <button type="button" onClick={() => void hangup()} className={`${styles.actionButton} ${styles.hangupButton}`}>
              <PhoneOff size={24} />
            </button>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

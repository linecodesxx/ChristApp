"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import styles from "./DoodleMiniGame.module.scss"

type Platform = {
  x: number
  y: number
  w: number
}

export type DoodleRuntimeState = {
  x: number
  y: number
  cameraY: number
  score: number
  alive: boolean
  emittedAt?: number
}

type DoodleMiniGameProps = {
  open: boolean
  myScore: number
  peerScore: number
  peerName: string
  peerState: DoodleRuntimeState | null
  peerPingMs?: number | null
  onClose: () => void
  onScoreChange: (score: number) => void
  onStateChange?: (state: DoodleRuntimeState) => void
}

const WORLD_W = 320
const WORLD_H = 480
const PLAYER_W = 24
const PLAYER_H = 24
const GRAVITY = 0.28
const JUMP_VELOCITY = -8.2
const MOVE_SPEED = 3.8

export default function DoodleMiniGame({
  open,
  myScore,
  peerScore,
  peerName,
  peerState,
  peerPingMs,
  onClose,
  onScoreChange,
  onStateChange,
}: DoodleMiniGameProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const frameRef = useRef<number | null>(null)
  const keyLeftRef = useRef(false)
  const keyRightRef = useRef(false)
  const touchXRef = useRef<number | null>(null)
  const peerStateRef = useRef<DoodleRuntimeState | null>(peerState)
  const peerNameRef = useRef(peerName)

  const [bestScore, setBestScore] = useState(0)
  const [isStarted, setIsStarted] = useState(false)
  const [isGameOver, setIsGameOver] = useState(false)

  const setMoveDirection = (direction: "left" | "right" | null) => {
    keyLeftRef.current = direction === "left"
    keyRightRef.current = direction === "right"
  }

  const isMyWinner = useMemo(() => myScore > peerScore, [myScore, peerScore])
  const isPeerWinner = useMemo(() => peerScore > myScore, [myScore, peerScore])

  useEffect(() => {
    peerStateRef.current = peerState
  }, [peerState])

  useEffect(() => {
    peerNameRef.current = peerName
  }, [peerName])

  useEffect(() => {
    if (!open) {
      setIsStarted(false)
      setIsGameOver(false)
      setMoveDirection(null)
      return
    }
    setIsStarted(false)
    setIsGameOver(false)
  }, [open])

  useEffect(() => {
    if (!open || !isStarted) {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current)
        frameRef.current = null
      }
      return
    }

    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) {
      return
    }

    let alive = true
    let cameraY = 0
    let score = 0

    const player = {
      x: WORLD_W / 2 - PLAYER_W / 2,
      y: WORLD_H - 70,
      vx: 0,
      vy: 0,
    }

    const ghost = {
      x: 0,
      y: 0,
      cameraY: 0,
      alive: false,
      initialized: false,
    }

    const platforms: Platform[] = []
    const basePlatformY = player.y + PLAYER_H + 4
    platforms.push({
      x: Math.max(0, Math.min(WORLD_W - 86, player.x - 28)),
      y: basePlatformY,
      w: 86,
    })
    for (let i = 1; i < 9; i += 1) {
      platforms.push({
        x: Math.random() * (WORLD_W - 72),
        y: basePlatformY - i * 64,
        w: 72,
      })
    }

    const draw = () => {
      ctx.clearRect(0, 0, WORLD_W, WORLD_H)

      const bg = ctx.createLinearGradient(0, 0, 0, WORLD_H)
      bg.addColorStop(0, "#2f2a22")
      bg.addColorStop(1, "#1c1914")
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, WORLD_W, WORLD_H)

      ctx.strokeStyle = "rgba(220,184,103,0.12)"
      for (let y = 0; y < WORLD_H; y += 24) {
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(WORLD_W, y)
        ctx.stroke()
      }

      for (const platform of platforms) {
        const py = platform.y - cameraY
        if (py < -20 || py > WORLD_H + 20) continue
        ctx.fillStyle = "#d4b159"
        ctx.fillRect(platform.x, py, platform.w, 8)
      }

      const peerY = ghost.initialized ? ghost.y - (ghost.cameraY - cameraY) : null
      const canDrawPeer =
        ghost.initialized &&
        ghost.alive &&
        peerY != null &&
        peerY > -PLAYER_H - 8 &&
        peerY < WORLD_H + PLAYER_H + 8

      if (canDrawPeer && peerY != null) {
        ctx.fillStyle = "rgba(100, 195, 255, 0.85)"
        ctx.fillRect(ghost.x, peerY, PLAYER_W, PLAYER_H)
      }

      ctx.fillStyle = "#f0e6d0"
      ctx.fillRect(player.x, player.y - cameraY, PLAYER_W, PLAYER_H)

      if (canDrawPeer && peerY != null) {
        ctx.fillStyle = "rgba(163, 222, 255, 0.95)"
        ctx.font = "600 10px Inter, sans-serif"
        ctx.fillText(peerNameRef.current, Math.max(4, ghost.x - 2), Math.max(10, peerY - 6))
      }
    }

    const update = () => {
      if (!alive) return

      const targetPeer = peerStateRef.current
      if (targetPeer) {
        if (!ghost.initialized) {
          ghost.x = targetPeer.x
          ghost.y = targetPeer.y
          ghost.cameraY = targetPeer.cameraY
          ghost.alive = targetPeer.alive
          ghost.initialized = true
        } else {
          ghost.x += (targetPeer.x - ghost.x) * 0.18
          ghost.y += (targetPeer.y - ghost.y) * 0.18
          ghost.cameraY += (targetPeer.cameraY - ghost.cameraY) * 0.18
          ghost.alive = targetPeer.alive
        }
      } else {
        ghost.initialized = false
      }

      if (keyLeftRef.current) player.vx = -MOVE_SPEED
      else if (keyRightRef.current) player.vx = MOVE_SPEED
      else player.vx *= 0.84

      player.x += player.vx
      if (player.x < -PLAYER_W) player.x = WORLD_W
      if (player.x > WORLD_W) player.x = -PLAYER_W

      player.vy += GRAVITY
      const prevY = player.y
      player.y += player.vy

      if (player.vy > 0) {
        for (const p of platforms) {
          const playerBottomPrev = prevY + PLAYER_H
          const playerBottomNext = player.y + PLAYER_H
          const platformTop = p.y
          const intersectsX = player.x + PLAYER_W > p.x && player.x < p.x + p.w
          const crossedTop = playerBottomPrev <= platformTop && playerBottomNext >= platformTop
          if (intersectsX && crossedTop) {
            player.y = p.y - PLAYER_H
            player.vy = JUMP_VELOCITY
            break
          }
        }
      }

      if (player.y - cameraY < WORLD_H * 0.35) {
        cameraY = player.y - WORLD_H * 0.35
      }

      for (const p of platforms) {
        if (p.y - cameraY > WORLD_H + 24) {
          p.y -= WORLD_H + 90
          p.x = Math.random() * (WORLD_W - p.w)
        }
      }

      const nextScore = Math.max(0, Math.floor(-cameraY))
      if (nextScore !== score) {
        score = nextScore
        onScoreChange(score)
      }
      onStateChange?.({
        x: player.x,
        y: player.y,
        cameraY,
        score,
        alive,
      })
      setBestScore((prev) => (score > prev ? score : prev))

      if (player.y - cameraY > WORLD_H + 40) {
        alive = false
        setIsGameOver(true)
        setIsStarted(false)
        onStateChange?.({
          x: player.x,
          y: player.y,
          cameraY,
          score,
          alive: false,
        })
      }

      draw()

      if (!alive) {
        ctx.fillStyle = "rgba(0,0,0,0.62)"
        ctx.fillRect(0, 0, WORLD_W, WORLD_H)
        ctx.fillStyle = "#fff1cf"
        ctx.font = "700 20px Inter, sans-serif"
        ctx.fillText("Игра окончена", 84, 208)
        ctx.font = "600 14px Inter, sans-serif"
        ctx.fillText(`Очки: ${score}`, 126, 238)
        return
      }

      frameRef.current = requestAnimationFrame(update)
    }

    frameRef.current = requestAnimationFrame(update)

    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current)
        frameRef.current = null
      }
    }
  }, [isStarted, onScoreChange, onStateChange, open])

  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") {
        keyLeftRef.current = true
      }
      if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") {
        keyRightRef.current = true
      }
    }

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") {
        keyLeftRef.current = false
      }
      if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") {
        keyRightRef.current = false
      }
    }

    window.addEventListener("keydown", onKeyDown)
    window.addEventListener("keyup", onKeyUp)

    return () => {
      keyLeftRef.current = false
      keyRightRef.current = false
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("keyup", onKeyUp)
    }
  }, [open])

  if (!open) return null

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.card} onClick={(e) => e.stopPropagation()}>
        <div className={styles.topRow}>
          <p className={styles.title}>Doodle</p>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </div>
        <p className={styles.scoreLine}>
          Я: {myScore} {isMyWinner ? "👑" : ""} · {peerName}: {peerScore} {isPeerWinner ? "👑" : ""}
        </p>
        <p className={styles.bestLine}>Лучший результат: {bestScore}</p>
        <p className={styles.bestLine}>Пинг: {peerPingMs != null ? `${peerPingMs} мс` : "—"}</p>
        <p className={styles.hint}>Управление: ← → или свайп</p>
        <div className={styles.canvasWrap}>
          <canvas
            ref={canvasRef}
            className={styles.canvas}
            width={WORLD_W}
            height={WORLD_H}
            onTouchStart={(e) => {
              touchXRef.current = e.touches[0]?.clientX ?? null
            }}
            onTouchMove={(e) => {
              const start = touchXRef.current
              const now = e.touches[0]?.clientX
              if (start == null || now == null) return
              const delta = now - start
              setMoveDirection(delta < -8 ? "left" : delta > 8 ? "right" : null)
            }}
            onTouchEnd={() => {
              setMoveDirection(null)
              touchXRef.current = null
            }}
          />
          {!isStarted ? (
            <div className={styles.startOverlay}>
              <button
                type="button"
                className={styles.startButton}
                onClick={() => {
                  onScoreChange(0)
                  setIsGameOver(false)
                  setIsStarted(true)
                }}
              >
                {isGameOver ? "Рестарт" : "Старт"}
              </button>
            </div>
          ) : null}
        </div>
        <div className={styles.mobileControls}>
          <button
            type="button"
            className={styles.controlButton}
            aria-label="Двигаться влево"
            onTouchStart={() => setMoveDirection("left")}
            onTouchEnd={() => setMoveDirection(null)}
            onTouchCancel={() => setMoveDirection(null)}
            onMouseDown={() => setMoveDirection("left")}
            onMouseUp={() => setMoveDirection(null)}
            onMouseLeave={() => setMoveDirection(null)}
          >
            ←
          </button>
          <button
            type="button"
            className={styles.controlButton}
            aria-label="Двигаться вправо"
            onTouchStart={() => setMoveDirection("right")}
            onTouchEnd={() => setMoveDirection(null)}
            onTouchCancel={() => setMoveDirection(null)}
            onMouseDown={() => setMoveDirection("right")}
            onMouseUp={() => setMoveDirection(null)}
            onMouseLeave={() => setMoveDirection(null)}
          >
            →
          </button>
        </div>
      </div>
    </div>
  )
}

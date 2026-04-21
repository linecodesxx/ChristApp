"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import styles from "./SnakeMiniGame.module.scss"

export type SnakeRuntimeState = {
  headX: number
  headY: number
  foodX: number
  foodY: number
  body: Array<{ x: number; y: number }>
  score: number
  alive: boolean
  emittedAt?: number
}

type SnakeMiniGameProps = {
  open: boolean
  myScore: number
  peerScore: number
  peerName: string
  peerState: SnakeRuntimeState | null
  peerPingMs?: number | null
  onClose: () => void
  onScoreChange: (score: number) => void
  onStateChange?: (state: SnakeRuntimeState) => void
}

const BOARD_CELLS_X = 24
const BOARD_CELLS_Y = 16
const CELL_SIZE = 18
const WORLD_W = BOARD_CELLS_X * CELL_SIZE
const WORLD_H = BOARD_CELLS_Y * CELL_SIZE
const TICK_MS = 145

type Direction = "up" | "down" | "left" | "right"

function isOppositeDirection(next: Direction, current: Direction) {
  return (
    (next === "up" && current === "down") ||
    (next === "down" && current === "up") ||
    (next === "left" && current === "right") ||
    (next === "right" && current === "left")
  )
}

function randomFood(exclude: Array<{ x: number; y: number }>) {
  const occupied = new Set(exclude.map((point) => `${point.x}:${point.y}`))
  const freeCells: Array<{ x: number; y: number }> = []

  for (let x = 0; x < BOARD_CELLS_X; x += 1) {
    for (let y = 0; y < BOARD_CELLS_Y; y += 1) {
      const key = `${x}:${y}`
      if (!occupied.has(key)) {
        freeCells.push({ x, y })
      }
    }
  }

  if (freeCells.length === 0) {
    return { x: 0, y: 0 }
  }

  const index = Math.floor(Math.random() * freeCells.length)
  return freeCells[index]
}

export default function SnakeMiniGame({
  open,
  myScore,
  peerScore,
  peerName,
  peerState,
  peerPingMs,
  onClose,
  onScoreChange,
  onStateChange,
}: SnakeMiniGameProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const frameRef = useRef<number | null>(null)
  const directionRef = useRef<Direction>("right")
  const nextDirectionRef = useRef<Direction>("right")
  const peerStateRef = useRef<SnakeRuntimeState | null>(peerState)
  const peerNameRef = useRef(peerName)

  const [bestScore, setBestScore] = useState(0)
  const [isStarted, setIsStarted] = useState(false)
  const [isGameOver, setIsGameOver] = useState(false)

  const isMyWinner = useMemo(() => myScore > peerScore, [myScore, peerScore])
  const isPeerWinner = useMemo(() => peerScore > myScore, [peerScore, myScore])

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
    let score = 0
    let lastTick = 0

    let snake: Array<{ x: number; y: number }> = [
      { x: Math.floor(BOARD_CELLS_X / 2), y: Math.floor(BOARD_CELLS_Y / 2) },
      { x: Math.floor(BOARD_CELLS_X / 2) - 1, y: Math.floor(BOARD_CELLS_Y / 2) },
      { x: Math.floor(BOARD_CELLS_X / 2) - 2, y: Math.floor(BOARD_CELLS_Y / 2) },
    ]

    let food = randomFood(snake)

    const drawCell = (x: number, y: number, fillStyle: string, radius = 4) => {
      const px = x * CELL_SIZE
      const py = y * CELL_SIZE
      ctx.fillStyle = fillStyle
      ctx.beginPath()
      ctx.roundRect(px + 1, py + 1, CELL_SIZE - 2, CELL_SIZE - 2, radius)
      ctx.fill()
    }

    const draw = () => {
      ctx.clearRect(0, 0, WORLD_W, WORLD_H)

      const bg = ctx.createLinearGradient(0, 0, 0, WORLD_H)
      bg.addColorStop(0, "#1b1713")
      bg.addColorStop(1, "#10100f")
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, WORLD_W, WORLD_H)

      ctx.strokeStyle = "rgba(212,177,89,0.09)"
      for (let x = 0; x <= WORLD_W; x += CELL_SIZE) {
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, WORLD_H)
        ctx.stroke()
      }
      for (let y = 0; y <= WORLD_H; y += CELL_SIZE) {
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(WORLD_W, y)
        ctx.stroke()
      }

      drawCell(food.x, food.y, "#f2ca58", 5)

      const peer = peerStateRef.current
      if (peer?.alive) {
        for (const point of peer.body ?? []) {
          drawCell(point.x, point.y, "rgba(106, 196, 255, 0.72)", 4)
        }
        drawCell(peer.headX, peer.headY, "rgba(169, 224, 255, 0.95)", 5)

        ctx.fillStyle = "rgba(169, 224, 255, 0.95)"
        ctx.font = "600 10px Inter, sans-serif"
        const textX = Math.max(4, Math.min(WORLD_W - 100, peer.headX * CELL_SIZE - 10))
        const textY = Math.max(10, peer.headY * CELL_SIZE - 6)
        ctx.fillText(peerNameRef.current, textX, textY)
      }

      for (let i = snake.length - 1; i >= 0; i -= 1) {
        const point = snake[i]
        drawCell(point.x, point.y, i === 0 ? "#efe4cd" : "#c8b083", i === 0 ? 5 : 4)
      }
    }

    const emitState = () => {
      const head = snake[0]
      onStateChange?.({
        headX: head.x,
        headY: head.y,
        foodX: food.x,
        foodY: food.y,
        body: snake,
        score,
        alive,
      })
    }

    const tick = () => {
      if (!alive) {
        return
      }

      if (!isOppositeDirection(nextDirectionRef.current, directionRef.current)) {
        directionRef.current = nextDirectionRef.current
      }

      const head = snake[0]
      const next = { x: head.x, y: head.y }

      if (directionRef.current === "up") next.y -= 1
      if (directionRef.current === "down") next.y += 1
      if (directionRef.current === "left") next.x -= 1
      if (directionRef.current === "right") next.x += 1

      const outOfBounds = next.x < 0 || next.y < 0 || next.x >= BOARD_CELLS_X || next.y >= BOARD_CELLS_Y
      const hitSelf = snake.some((point) => point.x === next.x && point.y === next.y)

      if (outOfBounds || hitSelf) {
        alive = false
        setIsGameOver(true)
        setIsStarted(false)
        emitState()
        draw()
        return
      }

      const nextSnake = [next, ...snake]
      const ateFood = next.x === food.x && next.y === food.y
      if (!ateFood) {
        nextSnake.pop()
      } else {
        score += 1
        onScoreChange(score)
        setBestScore((prev) => (score > prev ? score : prev))
        food = randomFood(nextSnake)
      }

      snake = nextSnake
      emitState()
      draw()
    }

    const loop = (ts: number) => {
      if (!alive) {
        frameRef.current = null
        return
      }

      if (lastTick === 0) {
        lastTick = ts
        draw()
      }

      if (ts - lastTick >= TICK_MS) {
        lastTick = ts
        tick()
      }

      frameRef.current = requestAnimationFrame(loop)
    }

    frameRef.current = requestAnimationFrame(loop)

    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current)
        frameRef.current = null
      }
    }
  }, [isStarted, onScoreChange, onStateChange, open])

  useEffect(() => {
    if (!open) {
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      if (key === "arrowup" || key === "w") {
        nextDirectionRef.current = "up"
      }
      if (key === "arrowdown" || key === "s") {
        nextDirectionRef.current = "down"
      }
      if (key === "arrowleft" || key === "a") {
        nextDirectionRef.current = "left"
      }
      if (key === "arrowright" || key === "d") {
        nextDirectionRef.current = "right"
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [open])

  if (!open) {
    return null
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.card} onClick={(event) => event.stopPropagation()}>
        <div className={styles.topRow}>
          <p className={styles.title}>Snake</p>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </div>
        <p className={styles.scoreLine}>
          Я: {myScore} {isMyWinner ? "👑" : ""} · {peerName}: {peerScore} {isPeerWinner ? "👑" : ""}
        </p>
        <p className={styles.bestLine}>Лучший результат: {bestScore}</p>
        <p className={styles.bestLine}>Пинг: {peerPingMs != null ? `${peerPingMs} мс` : "—"}</p>
        <p className={styles.hint}>Управление: WASD или стрелки</p>

        <div className={styles.canvasWrap}>
          <canvas ref={canvasRef} className={styles.canvas} width={WORLD_W} height={WORLD_H} />
          {!isStarted ? (
            <div className={styles.startOverlay}>
              <button
                type="button"
                className={styles.startButton}
                onClick={() => {
                  onScoreChange(0)
                  setIsGameOver(false)
                  directionRef.current = "right"
                  nextDirectionRef.current = "right"
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
            className={`${styles.controlButton} ${styles.controlUp}`}
            onClick={() => (nextDirectionRef.current = "up")}
          >
            ↑
          </button>
          <button
            type="button"
            className={`${styles.controlButton} ${styles.controlLeft}`}
            onClick={() => (nextDirectionRef.current = "left")}
          >
            ←
          </button>
          <button
            type="button"
            className={`${styles.controlButton} ${styles.controlRight}`}
            onClick={() => (nextDirectionRef.current = "right")}
          >
            →
          </button>
          <button
            type="button"
            className={`${styles.controlButton} ${styles.controlDown}`}
            onClick={() => (nextDirectionRef.current = "down")}
          >
            ↓
          </button>
        </div>
      </div>
    </div>
  )
}

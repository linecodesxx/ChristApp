"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import styles from "./ChristianFilwordMiniGame.module.scss"

type ChristianFilwordMiniGameProps = {
  open: boolean
  onClose: () => void
}

type WordEntry = {
  word: string
  clue: string
}

type Point = {
  row: number
  col: number
}

type Direction = {
  dr: number
  dc: number
}

type GeneratedPuzzle = {
  grid: string[][]
  entries: WordEntry[]
}

const DESKTOP_GRID_SIZE = 12
const MOBILE_GRID_SIZE = 8

const WORD_ENTRIES: WordEntry[] = [
  { word: "ЛЮБОВЬ", clue: "Главная заповедь и сущность Бога." },
  { word: "ПУСТЫНЯ", clue: "Место, где произошло чудо умножения хлебов и рыб." },
  { word: "МОЛИТВА", clue: "Тихий разговор человека с Создателем." },
  { word: "МАННА", clue: "Хлеб, сошедший с небес для израильтян." },
  { word: "ПАСТЫРЬ", clue: "Тот, кто ведет стадо и заботится о каждой овечке." },
  { word: "АНГЕЛ", clue: "Вестник Божий, приносящий благую весть." },
  { word: "БЫТИЕ", clue: "Первая книга Библии о начале всего." },
  { word: "БЛАГОДАТЬ", clue: "Дар Божий, который дается даром, а не по заслугам." },
  { word: "ГОЛУБЬ", clue: "Символ мира, прилетевший к Ною после потопа." },
  { word: "СИНАЙ", clue: "Гора, на которой Моисей получил скрижали Завета." },
]

const DIRECTIONS: Direction[] = [
  { dr: 0, dc: 1 },
  { dr: 1, dc: 0 },
  { dr: 1, dc: 1 },
  { dr: -1, dc: 1 },
  { dr: 0, dc: -1 },
  { dr: -1, dc: 0 },
  { dr: -1, dc: -1 },
  { dr: 1, dc: -1 },
]

const FILL_ALPHABET = [
  "А",
  "Б",
  "В",
  "Г",
  "Д",
  "Е",
  "Ж",
  "З",
  "И",
  "Й",
  "К",
  "Л",
  "М",
  "Н",
  "О",
  "П",
  "Р",
  "С",
  "Т",
  "У",
  "Ф",
  "Х",
  "Ц",
  "Ч",
  "Ш",
  "Щ",
  "Ъ",
  "Ы",
  "Ь",
  "Э",
  "Ю",
  "Я",
]

function keyOf(point: Point) {
  return `${point.row}:${point.col}`
}

function shuffled<T>(items: T[]) {
  const clone = [...items]
  for (let i = clone.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const temp = clone[i]
    clone[i] = clone[j]
    clone[j] = temp
  }
  return clone
}

function isStraightLine(start: Point, end: Point) {
  const dr = end.row - start.row
  const dc = end.col - start.col
  return dr === 0 || dc === 0 || Math.abs(dr) === Math.abs(dc)
}

function lineFromPoints(start: Point, end: Point): Point[] {
  if (!isStraightLine(start, end)) {
    return [start]
  }

  const dr = Math.sign(end.row - start.row)
  const dc = Math.sign(end.col - start.col)
  const length = Math.max(Math.abs(end.row - start.row), Math.abs(end.col - start.col)) + 1

  const points: Point[] = []
  for (let i = 0; i < length; i += 1) {
    points.push({ row: start.row + dr * i, col: start.col + dc * i })
  }
  return points
}

function canPlaceWord(grid: string[][], gridSize: number, word: string, row: number, col: number, direction: Direction) {
  for (let i = 0; i < word.length; i += 1) {
    const r = row + direction.dr * i
    const c = col + direction.dc * i
    if (r < 0 || c < 0 || r >= gridSize || c >= gridSize) {
      return false
    }
    const existing = grid[r][c]
    if (existing !== "" && existing !== word[i]) {
      return false
    }
  }
  return true
}

function placeWord(grid: string[][], word: string, row: number, col: number, direction: Direction) {
  for (let i = 0; i < word.length; i += 1) {
    const r = row + direction.dr * i
    const c = col + direction.dc * i
    grid[r][c] = word[i]
  }
}

function fillGridWithRandomLetters(grid: string[][], gridSize: number) {
  for (let row = 0; row < gridSize; row += 1) {
    for (let col = 0; col < gridSize; col += 1) {
      if (!grid[row][col]) {
        grid[row][col] = FILL_ALPHABET[Math.floor(Math.random() * FILL_ALPHABET.length)]
      }
    }
  }
}

function tryGenerateGrid(gridSize: number, entries: WordEntry[]): string[][] | null {
  const grid = Array.from({ length: gridSize }, () => Array.from({ length: gridSize }, () => ""))

  const words = [...entries]
    .map((entry) => entry.word)
    .sort((left, right) => right.length - left.length)

  for (const word of words) {
    let placed = false

    for (let attempt = 0; attempt < 360 && !placed; attempt += 1) {
      const direction = DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)]
      const row = Math.floor(Math.random() * gridSize)
      const col = Math.floor(Math.random() * gridSize)

      if (!canPlaceWord(grid, gridSize, word, row, col, direction)) {
        continue
      }

      placeWord(grid, word, row, col, direction)
      placed = true
    }

    if (!placed) {
      return null
    }
  }

  fillGridWithRandomLetters(grid, gridSize)
  return grid
}

function generatePuzzle(gridSize: number): GeneratedPuzzle {
  const eligibleEntries = WORD_ENTRIES.filter((entry) => entry.word.length <= gridSize)

  for (let attempt = 0; attempt < 160; attempt += 1) {
    const randomizedEntries = shuffled(eligibleEntries)
    const grid = tryGenerateGrid(gridSize, randomizedEntries)
    if (grid) {
      return {
        grid,
        entries: randomizedEntries,
      }
    }
  }

  // Fallback без рекурсии: уменьшаем количество слов, чтобы гарантировать старт игры.
  for (let keep = eligibleEntries.length - 1; keep >= 1; keep -= 1) {
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const reducedEntries = shuffled(eligibleEntries).slice(0, keep)
      const grid = tryGenerateGrid(gridSize, reducedEntries)
      if (grid) {
        return {
          grid,
          entries: reducedEntries,
        }
      }
    }
  }

  const emptyGrid = Array.from({ length: gridSize }, () => Array.from({ length: gridSize }, () => ""))
  fillGridWithRandomLetters(emptyGrid, gridSize)

  return {
    grid: emptyGrid,
    entries: [],
  }
}

export default function ChristianFilwordMiniGame({ open, onClose }: ChristianFilwordMiniGameProps) {
  const [seed, setSeed] = useState(0)
  const [selectedPath, setSelectedPath] = useState<Point[]>([])
  const [foundWords, setFoundWords] = useState<Set<string>>(() => new Set())
  const [foundCells, setFoundCells] = useState<Set<string>>(() => new Set())
  const [gridSize, setGridSize] = useState(DESKTOP_GRID_SIZE)

  const dragActiveRef = useRef(false)
  const startPointRef = useRef<Point | null>(null)
  const lastVibrationSelectionLenRef = useRef(0)

  useEffect(() => {
    if (typeof window === "undefined") return

    const mediaQuery = window.matchMedia("(max-width: 640px)")
    const applyGridSize = () => {
      setGridSize(mediaQuery.matches ? MOBILE_GRID_SIZE : DESKTOP_GRID_SIZE)
    }

    applyGridSize()
    mediaQuery.addEventListener("change", applyGridSize)
    return () => {
      mediaQuery.removeEventListener("change", applyGridSize)
    }
  }, [])

  const puzzle = useMemo<GeneratedPuzzle>(() => {
    if (!open) {
      return {
        grid: Array.from({ length: gridSize }, () => Array.from({ length: gridSize }, () => "")),
        entries: WORD_ENTRIES.filter((entry) => entry.word.length <= gridSize),
      }
    }
    return generatePuzzle(gridSize)
  }, [gridSize, open, seed])

  const grid = puzzle.grid
  const puzzleEntries = puzzle.entries

  const unresolvedWords = useMemo(
    () => puzzleEntries.map((entry) => entry.word).filter((word) => !foundWords.has(word)),
    [foundWords, puzzleEntries],
  )

  const progress = puzzleEntries.length > 0 ? foundWords.size / puzzleEntries.length : 0

  const selectedWord = useMemo(
    () => selectedPath.map((point) => grid[point.row]?.[point.col] ?? "").join(""),
    [grid, selectedPath],
  )

  useEffect(() => {
    if (!open) {
      dragActiveRef.current = false
      startPointRef.current = null
      setSelectedPath([])
    }
  }, [open])

  const resetGame = () => {
    setFoundWords(new Set())
    setFoundCells(new Set())
    setSelectedPath([])
    startPointRef.current = null
    dragActiveRef.current = false
    setSeed((prev) => prev + 1)
  }

  const vibrateLight = () => {
    if (typeof window === "undefined") return
    if (typeof window.navigator?.vibrate !== "function") return
    window.navigator.vibrate(10)
  }

  const maybeVibrateForCorrectPrefix = (wordCandidate: string) => {
    const nextLen = wordCandidate.length
    if (nextLen <= lastVibrationSelectionLenRef.current) {
      return
    }

    const hasPrefix = unresolvedWords.some((word) => word.startsWith(wordCandidate) || word.endsWith(wordCandidate))
    if (!hasPrefix) {
      return
    }

    lastVibrationSelectionLenRef.current = nextLen
    vibrateLight()
  }

  const updatePath = (endPoint: Point) => {
    const startPoint = startPointRef.current
    if (!startPoint) {
      return
    }

    const nextPath = lineFromPoints(startPoint, endPoint)
    setSelectedPath(nextPath)

    const nextWord = nextPath.map((point) => grid[point.row]?.[point.col] ?? "").join("")
    maybeVibrateForCorrectPrefix(nextWord)
  }

  const completeSelection = () => {
    dragActiveRef.current = false
    startPointRef.current = null
    lastVibrationSelectionLenRef.current = 0

    if (!selectedPath.length) {
      return
    }

    const candidate = selectedPath.map((point) => grid[point.row]?.[point.col] ?? "").join("")
    const reverse = candidate.split("").reverse().join("")

    const matchedWord = unresolvedWords.find((word) => word === candidate || word === reverse)
    if (!matchedWord) {
      setSelectedPath([])
      return
    }

    setFoundWords((prev) => {
      const next = new Set(prev)
      next.add(matchedWord)
      return next
    })
    setFoundCells((prev) => {
      const next = new Set(prev)
      for (const point of selectedPath) {
        next.add(keyOf(point))
      }
      return next
    })
    setSelectedPath([])
  }

  if (!open) {
    return null
  }

  const selectedCellKeys = new Set(selectedPath.map((point) => keyOf(point)))

  return (
    <div className={styles.overlay} onPointerUp={completeSelection} onClick={onClose}>
      <div className={styles.card} onClick={(event) => event.stopPropagation()}>
        <div className={styles.topRow}>
          <p className={styles.title}>Христианский филворд</p>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </div>

        <div className={styles.progressRow}>
          <span className={styles.progressLabel}>Найдено: {foundWords.size}/{puzzleEntries.length}</span>
          <button type="button" className={styles.resetButton} onClick={resetGame}>
            Новая сетка
          </button>
        </div>
        <div className={styles.progressTrack}>
          <div className={styles.progressFill} style={{ width: `${Math.max(3, progress * 100)}%` }} />
        </div>

        <div className={styles.grid}>
          <div className={styles.gridSizer} style={{ gridTemplateColumns: `repeat(${gridSize}, minmax(0, 1fr))` }}>
          {grid.map((rowLetters, rowIndex) =>
            rowLetters.map((letter, colIndex) => {
              const point = { row: rowIndex, col: colIndex }
              const key = keyOf(point)
              const isSelected = selectedCellKeys.has(key)
              const isFound = foundCells.has(key)

              return (
                <button
                  key={key}
                  type="button"
                  className={`${styles.cell}${isSelected ? ` ${styles.cellSelected}` : ""}${isFound ? ` ${styles.cellFound}` : ""}`}
                  onPointerDown={(event) => {
                    event.preventDefault()
                    dragActiveRef.current = true
                    startPointRef.current = point
                    lastVibrationSelectionLenRef.current = 0
                    setSelectedPath([point])
                    maybeVibrateForCorrectPrefix(letter)
                  }}
                  onPointerEnter={() => {
                    if (!dragActiveRef.current) {
                      return
                    }
                    updatePath(point)
                  }}
                  onPointerUp={completeSelection}
                >
                  {letter}
                </button>
              )
            }),
          )}
          </div>
        </div>

        <p className={styles.selectionPreview}>Выделение: {selectedWord || "—"}</p>

        <div className={styles.clues}>
          {puzzleEntries.map((entry, index) => {
            const isFound = foundWords.has(entry.word)
            const hiddenMask = "•".repeat(entry.word.length)
            return (
              <div key={entry.word} className={`${styles.clueItem}${isFound ? ` ${styles.clueFound}` : ""}`}>
                <span className={styles.clueIndex}>{index + 1}.</span>
                <span className={styles.clueText}>{entry.clue}</span>
                <span className={`${styles.clueWord}${!isFound ? ` ${styles.clueWordHidden}` : ""}`}>
                  {isFound ? entry.word : hiddenMask}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

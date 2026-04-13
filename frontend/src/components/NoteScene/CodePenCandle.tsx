import styles from "./CodePenCandle.module.scss"

/**
 * Свічка на Pure CSS: та сама розмітка, що в CodePen Takuma_BMe (BaVdNLK) —
 * blinking-glow, thread, glow, flame внутри воска.
 */
export default function CodePenCandle() {
  return (
    <div className={styles.holder} aria-hidden>
      <div className={styles.candle}>
        <div className={styles.blinkingGlow} />
        <div className={styles.thread} />
        <div className={styles.glow} />
        <div className={styles.flame} />
      </div>
    </div>
  )
}

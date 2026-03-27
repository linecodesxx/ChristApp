import Link from "next/link"
import type { VerseNotesCollectionMeta } from "@/lib/verseNotesCollections"
import { cormorantGaramond } from "@/styles/fonts"
import styles from "./CollectionCoverCard.module.scss"

const VARIANT_CLASS: Record<VerseNotesCollectionMeta["coverVariant"], string> = {
  gratitude: styles.gratitude,
  love: styles.love,
  prayer: styles.prayer,
  insights: styles.insights,
  sermons: styles.sermons,
}

export default function CollectionCoverCard({ collection }: { collection: VerseNotesCollectionMeta }) {
  const blurClass = VARIANT_CLASS[collection.coverVariant]

  return (
    <Link
      href={`/verse-notes/${collection.id}`}
      className={`${cormorantGaramond.variable} ${styles.link}`}
    >
      <div className={`${styles.cover} ${blurClass}`}>
        <div className={styles.inner}>
          <h2 className={styles.title}>{collection.title}</h2>
          <p className={styles.tagline}>{collection.tagline}</p>
        </div>
      </div>
    </Link>
  )
}

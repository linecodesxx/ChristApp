import Link from "next/link"
import { Heart, Lightbulb, BookOpen, Leaf, Quote } from "lucide-react"
import type { VerseNotesCollectionMeta } from "@/lib/verseNotesCollections"
import styles from "./CollectionCoverCard.module.scss"

const VARIANT_CLASS: Record<VerseNotesCollectionMeta["coverVariant"], string> = {
  gratitude: styles.gratitude,
  love: styles.love,
  prayer: styles.prayer,
  insights: styles.insights,
  sermons: styles.sermons,
}

const VARIANT_ICON: Record<VerseNotesCollectionMeta["coverVariant"], React.ReactNode> = {
  gratitude: <Leaf size={24} strokeWidth={1.5} />,
  love: <Heart size={24} strokeWidth={1.5} />,
  prayer: <Quote size={24} strokeWidth={1.5} />,
  insights: <Lightbulb size={24} strokeWidth={1.5} />,
  sermons: <BookOpen size={24} strokeWidth={1.5} />,
}

export default function CollectionCoverCard({ collection }: { collection: VerseNotesCollectionMeta }) {
  const blurClass = VARIANT_CLASS[collection.coverVariant]
  const icon = VARIANT_ICON[collection.coverVariant]

  return (
    <Link
      href={`/verse-notes/${collection.id}`}
      className={styles.link}
    >
      <div className={`${styles.cover} ${blurClass}`}>
        <div className={styles.iconWrapper}>
          {icon}
        </div>
        <div className={styles.inner}>
          <h2 className={styles.title}>{collection.title}</h2>
          <p className={styles.tagline}>{collection.tagline}</p>
        </div>
      </div>
    </Link>
  )
}

import Image from "next/image"
import styles from "./StickerPicker.module.scss"

export type StickerItem = {
  id: string
  path: string
  label: string
}

export const STICKERS: StickerItem[] = [
  { id: "jesus_1", path: "/stickers/jesus1.webp", label: "Стикер 1" },
  { id: "jesus_2", path: "/stickers/jesus2.webp", label: "Стикер 2" },
  { id: "jesus_3", path: "/stickers/jesus3.webp", label: "Стикер 3" },
  { id: "jesus_4", path: "/stickers/jesus4.webp", label: "Стикер 4" },
  { id: "jesus_5", path: "/stickers/jesus5.webp", label: "Стикер 5" },
  { id: "jesus_6", path: "/stickers/jesus6.webp", label: "Стикер 6" },
  { id: "jesus_7", path: "/stickers/jesus7.webp", label: "Стикер 7" },
  { id: "jesus_8", path: "/stickers/jesus8.webp", label: "Стикер 8" },
  { id: "jesus_9", path: "/stickers/jesus9.webp", label: "Стикер 9" },
  { id: "jesus_10", path: "/stickers/jesus10.webp", label: "Стикер 10" },
  { id: "jesus_11", path: "/stickers/jesus11.webp", label: "Стикер 11" },
  { id: "jesus_12", path: "/stickers/jesus12.webp", label: "Стикер 12" },
]

type StickerPickerProps = {
  onSelect: (sticker: StickerItem) => void
}

export default function StickerPicker({ onSelect }: StickerPickerProps) {
  return (
    <div className={styles.container}>
      {STICKERS.map((sticker) => (
        <button
          key={sticker.id}
          type="button"
          className={styles.item}
          onClick={() => onSelect(sticker)}
          aria-label={`Отправить стикер: ${sticker.label}`}
          title={sticker.label}
        >
          <Image src={sticker.path} alt={sticker.label} width={40} height={40} className={styles.stickerImage} />
        </button>
      ))}
    </div>
  )
}
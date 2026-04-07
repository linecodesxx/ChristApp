import BibleReader from "@/components/BibleReader/BibleReader"
import RandomVerseWidget from "@/components/RandomVerseWidget/RandomVerseWidget"

export default async function BiblePage() {
  return (
    <div>
      <RandomVerseWidget />
      <BibleReader />
    </div>
  )
}

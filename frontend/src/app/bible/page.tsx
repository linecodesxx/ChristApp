import { getBibleData } from "@/lib/storage";
import BibleReader from "@/components/BibleReader/BibleReader";

export default async function BiblePage() {
  // const bible = await getBibleData();

  // if (!bible?.Books) return <div>Нет данных</div>;

  // // клиентский компонент восстановит последнюю позицию чтения
  return <BibleReader  />;
}
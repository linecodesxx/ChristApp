import { readFile } from "node:fs/promises";
import path from "node:path";
import type { BibleData } from "@/types/bible";

// export async function getBibleData(): Promise<BibleData> {
//   const jsonPath = path.join(process.cwd(), "public", "nrt.json");
//   const content = await readFile(jsonPath, "utf-8");
//   return JSON.parse(content) as BibleData;
// }
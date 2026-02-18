import TabBar from "@/components/TabBar"
import { redirect } from "next/navigation"

export default function Home() {
  return redirect("/chat")
}

import NestLangHandshake from "@/components/NestLangHandshake/NestLocaleHandshake"

export default function LoginGroupLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <NestLangHandshake />
      {children}
    </>
  )
}

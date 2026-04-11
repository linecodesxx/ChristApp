import NestLocaleHandshake from "@/components/NestLocaleHandshake/NestLocaleHandshake"

export default function LoginGroupLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <NestLocaleHandshake />
      {children}
    </>
  )
}

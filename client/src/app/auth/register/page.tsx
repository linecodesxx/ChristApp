"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/hooks/useAuth"
import styles from "../login/page.module.scss"

export default function RegisterPage() {
  const router = useRouter()
  const { login, error, isSubmitting } = useAuth()

  const [email, setEmail] = useState("")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [registerError, setRegisterError] = useState<string | null>(null)

  const handleRegister = async () => {
    try {
      setRegisterError(null)

      if (!process.env.NEXT_PUBLIC_API_URL) {
        throw new Error("Не задан NEXT_PUBLIC_API_URL")
      }

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, username, password }),
      })

      if (!res.ok) {
        const contentType = res.headers.get("content-type") || ""

        if (contentType.includes("application/json")) {
          const errData = await res.json()
          throw new Error(errData.message || "Ошибка регистрации")
        }

        throw new Error("Ошибка регистрации: сервер вернул не JSON")
      }

      // после успешной регистрации автоматически логиним пользователя
      const success = await login(email, password)
      if (success) router.push("/chat")
    } catch (err: any) {
      setRegisterError(err.message)
    }
  }

  return (
    <main className={`${styles.main} container`}>
      <h1>Регистрация</h1>

      {registerError && <p className={styles.error}>{registerError}</p>}
      {error && <p className={styles.error}>{error}</p>}

      <input value={email} placeholder="Email" onChange={(e) => setEmail(e.target.value)} />
      <input value={username} placeholder="Username" onChange={(e) => setUsername(e.target.value)} />
      <input value={password} type="password" placeholder="Пароль" onChange={(e) => setPassword(e.target.value)} />

      <button onClick={handleRegister} disabled={isSubmitting} className={styles.button}>
        {isSubmitting ? "Регистрация..." : "Зарегистрироваться"}
      </button>
    </main>
  )
}

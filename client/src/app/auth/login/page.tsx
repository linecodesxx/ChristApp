"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/hooks/useAuth"
import styles from "./page.module.scss"

export default function LoginPage() {
  const router = useRouter()
  const { user, loading, login, error, isSubmitting } = useAuth()

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")

  const handleLogin = async () => {
    const success = await login(email, password)
    if (success) {
      router.push("/chat")
    }
  }

  if (loading) return <p>Проверка...</p>

  return (
    <div className={styles.main}>
      {!user ? (
        <>
          <h1>Вход</h1>

          {error && <p className={styles.error}>{error}</p>}

          <input value={email} placeholder="Email" onChange={(e) => setEmail(e.target.value)} />

          <input type="password" value={password} placeholder="Пароль" onChange={(e) => setPassword(e.target.value)} />

          <button onClick={handleLogin} disabled={isSubmitting} className={styles.button}>
            {isSubmitting ? "Вход..." : "Войти"}
          </button>

          <p>
            Нет аккаунта?{" "}
            <span className={styles.registerLink} onClick={() => router.push("/auth/register")}>
              Зарегистрироваться
            </span>
          </p>
        </>
      ) : (
        <>
          <h1>Вы уже авторизованы</h1>

          <button onClick={() => router.push("/chat")}>Перейти в чат</button>
        </>
      )}
    </div>
  )
}

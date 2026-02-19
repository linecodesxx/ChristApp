"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import styles from "./page.module.scss"

type User = {
  id: number
  email: string
  username: string
}

export default function LoginPage() {
  const router = useRouter()

  const [user, setUser] = useState<User | null>(null)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(true)

  // Проверка авторизации при открытии страницы
  useEffect(() => {
    const token = localStorage.getItem("token")

    if (!token) {
      setLoading(false)
      return
    }

    fetch("http://localhost:3001/auth/me", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then(async (res) => {
        if (!res.ok) {
          localStorage.removeItem("token")
          setLoading(false)
          return
        }

        const data = await res.json()
        setUser(data)
        setLoading(false)
      })
      .catch(() => {
        setLoading(false)
      })
  }, [])

  const handleLogin = async () => {
    const res = await fetch("http://localhost:3001/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    })

    const data = await res.json()

    if (data.access_token) {
      localStorage.setItem("token", data.access_token)
      setUser(data.user) // если возвращаешь user
    } else {
      alert("Неверные данные")
    }
  }

  const handleLogout = () => {
    localStorage.removeItem("token")
    setUser(null)
  }

  if (loading) return <p>Проверка...</p>

  return (
    <main className={`${styles.main} container`}>
      {!user ? (
        <>
          <h1>Вход</h1>

          <input
            placeholder="Email"
            onChange={(e) => setEmail(e.target.value)}
          />

          <input
            type="password"
            placeholder="Пароль"
            onChange={(e) => setPassword(e.target.value)}
          />

          <button onClick={handleLogin} className={styles.button}>
            Войти
          </button>

          <p>Нет аккаунта?{" "}
            <span
              className={styles.registerLink}
              onClick={() => router.push("/auth/register")}
            >
              Зарегистрироваться
            </span>
          </p>
        </>
      ) : (
        <>
          <h1>Профиль</h1>
          <p><b>Username:</b> {user.username}</p>
          <p><b>Email:</b> {user.email}</p>

          <button onClick={() => router.push("/chat")}>
            Перейти в чат
          </button>

          <button onClick={handleLogout} className={styles.button}>
            Выйти
          </button>
        </>
      )}
    </main>
  )
}

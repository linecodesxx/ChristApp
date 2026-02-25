"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/hooks/useAuth"
import styles from "@/app/(login)/page.module.scss"
import Image from "next/image"

export default function LoginPage() {
  const router = useRouter()
  const { user, loading, login, error, isSubmitting } = useAuth()

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")

  const handleLoginSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const success = await login(email, password)
    if (success) {
      router.push("/chat")
    }
  }

  const handleNavigateToRegister = () => {
    router.push("/register")
  }

  const handleNavigateToChat = () => {
    router.push("/chat")
  }

  if (loading) {
    return (
      <main className={styles.main}>
        <section className={styles.card}>
          <p className={styles.loadingText}>Проверка...</p>
        </section>
      </main>
    )
  }

  if (user) {
    return (
      <main className={styles.main}>
        <section className={styles.card}>
          <header className={styles.header}>
            <h1 className={styles.title}>Вы уже авторизованы</h1>
          </header>

          <div className={styles.actions}>
            <button onClick={handleNavigateToChat} className={styles.button}>
              Перейти в чат
            </button>
          </div>
        </section>
      </main>
    )
  }

  return (
    <section className={styles.loginPage}>
      <section className={styles.card}>
        <header className={styles.header}>
          <div className={styles.logo}>
            <Image src="/logo.svg" width={36} height={44} alt="Logo" className={styles.logo} />
          </div>
          <h1 className={styles.title}>Christ App</h1>
          <p className={styles.subtitle}>Read. Share. Stay connected.</p>
        </header>

        {error && (
          <div className={styles.errorWrap}>
            <p className={styles.error}>{error}</p>
          </div>
        )}

        <form className={styles.form} onSubmit={handleLoginSubmit}>
          <div className={styles.fieldGroup}>
            <label htmlFor="email" className={styles.label}>
              Email
            </label>
            <input
              id="email"
              className={styles.input}
              value={email}
              placeholder="Введите email"
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className={styles.fieldGroup}>
            <label htmlFor="password" className={styles.label}>
              Пароль
            </label>
            <input
              id="password"
              className={styles.input}
              type="password"
              value={password}
              placeholder="Введите пароль"
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div className={styles.actions}>
            <button type="submit" disabled={isSubmitting} className={styles.button}>
              {isSubmitting ? "Вход..." : "Войти"}
            </button>
          </div>
        </form>

        <footer className={styles.footer}>
          <p className={styles.footerText}>
            Нет аккаунта?{" "}
            <span className={styles.registerLink} onClick={handleNavigateToRegister}>
              Зарегистрироваться
            </span>
          </p>
        </footer>
      </section>
    </section>
  )
}

"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/hooks/useAuth"
import styles from "@/app/(login)/login.module.scss"
import Image from "next/image"

export default function RegisterPage() {
  const router = useRouter()
  const { login, error, isSubmitting } = useAuth()

  const [email, setEmail] = useState("")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [registerError, setRegisterError] = useState<string | null>(null)

  const handleNavigateToLogin = () => {
    router.push("/")
  }

  const handleRegisterSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    try {
      setRegisterError(null)

      if (!process.env.NEXT_PUBLIC_API_URL) {
        throw new Error("Не задан NEXT_PUBLIC_API_URL")
      }

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/register`, {
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

      const success = await login(email, password)
      if (success) router.push("/chat")
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Ошибка регистрации"
      setRegisterError(message)
    }
  }

  return (
    <section className={styles.loginPage}>
      <section className={styles.card}>
        <header className={styles.header}>
          <div className={styles.logo}>
            <Image src="/logo.svg" width={36} height={44} alt="Logo" className={styles.logo} />
          </div>
          <h1 className={styles.title}>Create account</h1>
          <p className={styles.subtitle}>Join Christ App in a minute.</p>
        </header>

        {registerError && (
          <div className={styles.errorWrap}>
            <p className={styles.error}>{registerError}</p>
          </div>
        )}

        {error && (
          <div className={styles.errorWrap}>
            <p className={styles.error}>{error}</p>
          </div>
        )}

        <form className={styles.form} onSubmit={handleRegisterSubmit}>
          <div className={styles.fieldGroup}>
            <label htmlFor="email" className={styles.label}>
              Email
            </label>
            <input
              id="email"
              className={styles.input}
              value={email}
              placeholder="Enter email"
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className={styles.fieldGroup}>
            <label htmlFor="username" className={styles.label}>
              Username
            </label>
            <input
              id="username"
              className={styles.input}
              value={username}
              placeholder="Enter username"
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          <div className={styles.fieldGroup}>
            <label htmlFor="password" className={styles.label}>
              Password
            </label>
            <input
              id="password"
              className={styles.input}
              type="password"
              value={password}
              placeholder="Enter password"
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div className={styles.actions}>
            <button type="submit" disabled={isSubmitting} className={styles.button}>
              {isSubmitting ? "Signing up..." : "Sign up"}
            </button>
          </div>
        </form>

        <footer className={styles.footer}>
          <p className={styles.footerText}>
            Already have an account?{" "}
            <span className={styles.registerLink} onClick={handleNavigateToLogin}>
              Sign in
            </span>
          </p>
        </footer>
      </section>
    </section>
  )
}

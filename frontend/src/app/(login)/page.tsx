"use client"

import { useState } from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { useAuth } from "@/hooks/useAuth"
import { type LoginFieldErrors, validateLoginForm } from "@/lib/formValidation"
import CrossLoader from "@/components/CrossLoader/CrossLoader"
import LoginServerWarmupPanel from "@/components/LoginServerWarmupPanel/LoginServerWarmupPanel"
import styles from "@/app/(login)/login.module.scss"

export default function LoginPage() {
  const router = useRouter()
  const { loading, login, error, isSubmitting } = useAuth()

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [fieldErrors, setFieldErrors] = useState<LoginFieldErrors>({})

  const handleLoginSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const normalizedEmail = email.trim()
    const nextErrors = validateLoginForm({ email: normalizedEmail, password })
    setFieldErrors(nextErrors)

    if (Object.keys(nextErrors).length > 0) {
      return
    }

    const success = await login(normalizedEmail, password)
    if (success) {
      router.push("/chat")
    }
  }

  const handleNavigateToRegister = () => {
    router.push("/register")
  }

  if (loading) {
    return (
      <main className={styles.main}>
        <section className={styles.card}>
          <LoginServerWarmupPanel />
          <CrossLoader className={styles.loaderInCard} label="Загрузка" variant="inline" />
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

        <LoginServerWarmupPanel />

        {error && (
          <div className={styles.errorWrap}>
            <p className={styles.error}>{error}</p>
          </div>
        )}

        <form className={styles.form} onSubmit={handleLoginSubmit} noValidate>
          <div className={styles.fieldGroup}>
            <label htmlFor="email" className={styles.label}>
              Email or username
            </label>
            <input
              id="email"
              className={`${styles.input} ${fieldErrors.email ? styles.inputInvalid : ""}`}
              type="text"
              value={email}
              autoComplete="username"
              placeholder="Enter your email or username"
              aria-invalid={Boolean(fieldErrors.email)}
              onChange={(e) => {
                setEmail(e.target.value)
                setFieldErrors((prev) => ({ ...prev, email: undefined }))
              }}
            />
            {fieldErrors.email && <p className={styles.fieldError}>{fieldErrors.email}</p>}
          </div>

          <div className={styles.fieldGroup}>
            <label htmlFor="password" className={styles.label}>
              Password
            </label>
            <input
              id="password"
              className={`${styles.input} ${fieldErrors.password ? styles.inputInvalid : ""}`}
              type="password"
              value={password}
              autoComplete="current-password"
              placeholder="Enter your password"
              aria-invalid={Boolean(fieldErrors.password)}
              onChange={(e) => {
                setPassword(e.target.value)
                setFieldErrors((prev) => ({ ...prev, password: undefined }))
              }}
            />
            {fieldErrors.password && <p className={styles.fieldError}>{fieldErrors.password}</p>}
          </div>

          <div className={styles.actions}>
            <button type="submit" disabled={isSubmitting} className={styles.button}>
              {isSubmitting ? "Logging in..." : "Log in"}
            </button>
          </div>
        </form>

        <footer className={styles.footer}>
          <p className={styles.footerText}>
            Don&apos;t have an account?{" "}
            <span className={styles.registerLink} onClick={handleNavigateToRegister}>
              Register
            </span>
          </p>
        </footer>
      </section>
    </section>
  )
}

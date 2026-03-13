"use client"

import { useState } from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { useAuth } from "@/hooks/useAuth"
import { saveRecentAuthIdentity } from "@/lib/authAutocomplete"
import { getApiErrorMessage } from "@/lib/apiError"
import { type RegisterFieldErrors, validateRegisterForm } from "@/lib/formValidation"
import styles from "@/app/(login)/login.module.scss"

export default function RegisterPage() {
  const router = useRouter()
  const { login, error, isSubmitting } = useAuth()

  const [email, setEmail] = useState("")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [fieldErrors, setFieldErrors] = useState<RegisterFieldErrors>({})
  const [registerError, setRegisterError] = useState<string | null>(null)

  const handleNavigateToLogin = () => {
    router.push("/")
  }

  const handleRegisterSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    try {
      const normalizedEmail = email.trim()
      const normalizedUsername = username.trim()

      const nextErrors = validateRegisterForm({
        email: normalizedEmail,
        username: normalizedUsername,
        password,
      })

      setFieldErrors(nextErrors)
      setRegisterError(null)

      if (Object.keys(nextErrors).length > 0) {
        return
      }

      if (!process.env.NEXT_PUBLIC_API_URL) {
        throw new Error("Не задан NEXT_PUBLIC_API_URL")
      }

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: normalizedEmail,
          username: normalizedUsername,
          password,
        }),
      })

      if (!res.ok) {
        const contentType = res.headers.get("content-type") || ""

        if (contentType.includes("application/json")) {
          const errData = await res.json()
          throw new Error(getApiErrorMessage(errData, "Ошибка регистрации"))
        }

        throw new Error("Ошибка регистрации: сервер вернул не JSON")
      }

      saveRecentAuthIdentity({
        email: normalizedEmail,
        username: normalizedUsername,
      })

      const success = await login(normalizedEmail, password)
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

        <form className={styles.form} onSubmit={handleRegisterSubmit} noValidate>
          <div className={styles.fieldGroup}>
            <label htmlFor="email" className={styles.label}>
              Email
            </label>
            <input
              id="email"
              className={`${styles.input} ${fieldErrors.email ? styles.inputInvalid : ""}`}
              type="email"
              value={email}
              autoComplete="email"
              placeholder="Enter email"
              aria-invalid={Boolean(fieldErrors.email)}
              onChange={(e) => {
                setEmail(e.target.value)
                setFieldErrors((prev) => ({ ...prev, email: undefined }))
              }}
            />
            {fieldErrors.email && <p className={styles.fieldError}>{fieldErrors.email}</p>}
          </div>

          <div className={styles.fieldGroup}>
            <label htmlFor="username" className={styles.label}>
              Username
            </label>
            <input
              id="username"
              className={`${styles.input} ${fieldErrors.username ? styles.inputInvalid : ""}`}
              value={username}
              autoComplete="username"
              placeholder="Enter username"
              aria-invalid={Boolean(fieldErrors.username)}
              onChange={(e) => {
                setUsername(e.target.value)
                setFieldErrors((prev) => ({ ...prev, username: undefined }))
              }}
            />
            {fieldErrors.username && <p className={styles.fieldError}>{fieldErrors.username}</p>}
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
              autoComplete="new-password"
              placeholder="Enter password"
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

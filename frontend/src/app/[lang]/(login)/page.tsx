"use client"

import { useState } from "react"
import Image from "next/image"
import { useTranslations } from "next-intl"
import { useRouter } from "@/i18n/navigation"
import { useAuth } from "@/hooks/useAuth"
import { type LoginFieldErrors, validateLoginForm } from "@/lib/formValidation"
import CrossLoader from "@/components/CrossLoader/CrossLoader"
import LoginServerWarmupPanel from "@/components/LoginServerWarmupPanel/LoginServerWarmupPanel"
import styles from "@/app/[lang]/(login)/login.module.scss"

export default function LoginPage() {
  const t = useTranslations("login")
  const router = useRouter()
  const { loading, login, error, isSubmitting } = useAuth()

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
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
          <CrossLoader className={styles.loaderInCard} label={t("loading")} variant="inline" />
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
          <h1 className={styles.title}>{t("title")}</h1>
          <p className={styles.subtitle}>{t("subtitle")}</p>
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
              {t("emailLabel")}
            </label>
            <input
              id="email"
              className={`${styles.input} ${fieldErrors.email ? styles.inputInvalid : ""}`}
              type="text"
              value={email}
              autoComplete="username"
              placeholder={t("emailPlaceholder")}
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
              {t("passwordLabel")}
            </label>
            <div className={styles.passwordWrap}>
              <input
                id="password"
                className={`${styles.input} ${styles.inputWithPasswordToggle} ${
                  fieldErrors.password ? styles.inputInvalid : ""
                }`}
                type={showPassword ? "text" : "password"}
                value={password}
                autoComplete="current-password"
                placeholder={t("passwordPlaceholder")}
                aria-invalid={Boolean(fieldErrors.password)}
                onChange={(e) => {
                  setPassword(e.target.value)
                  setFieldErrors((prev) => ({ ...prev, password: undefined }))
                }}
              />
              <button
                type="button"
                className={`${styles.passwordToggleBtn} ${showPassword ? styles.passwordToggleBtnActive : ""}`}
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? t("hidePasswordAria") : t("showPasswordAria")}
                aria-pressed={showPassword}
              >
                <Image src="/icon-password.svg" alt="" width={22} height={22} aria-hidden />
              </button>
            </div>
            {fieldErrors.password && <p className={styles.fieldError}>{fieldErrors.password}</p>}
          </div>

          <div className={styles.actions}>
            <button type="submit" disabled={isSubmitting} className={styles.button}>
              {isSubmitting ? t("loggingIn") : t("logIn")}
            </button>
          </div>
        </form>

        <footer className={styles.footer}>
          <p className={styles.footerText}>
            {t("noAccount")}{" "}
            <span className={styles.registerLink} onClick={handleNavigateToRegister}>
              {t("registerLink")}
            </span>
          </p>
        </footer>
      </section>
    </section>
  )
}

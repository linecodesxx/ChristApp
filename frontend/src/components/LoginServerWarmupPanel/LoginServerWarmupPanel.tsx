"use client"

import { useTranslations } from "next-intl"
import { Link } from "@/i18n/navigation"
import { useBackendWarmupStatus } from "@/hooks/useBackendWarmupStatus"
import styles from "./LoginServerWarmupPanel.module.scss"

type LoginServerWarmupPanelProps = {
  enabled?: boolean
}

export default function LoginServerWarmupPanel({ enabled = true }: LoginServerWarmupPanelProps) {
  const t = useTranslations("login")
  const { reachable, checking, elapsedLabel, hint, showPanel } = useBackendWarmupStatus(enabled)

  if (!showPanel) {
    return null
  }

  return (
    <div
      className={`${styles.panel} ${reachable === false ? styles.panelWarning : styles.panelNeutral}`}
      role="status"
      aria-live="polite"
    >
      <div className={styles.header}>
        <span
          className={`${styles.dot} ${checking ? styles.dotChecking : reachable === false ? styles.dotWarning : styles.dotNeutral}`}
          aria-hidden
        />
        <p className={styles.title}>
          {checking ? t("warmupConnecting") : t("warmupUnavailable")}
        </p>
      </div>

      {checking ? (
        <>
          <p className={styles.body}>{t("warmupCheckingBody")}</p>
          <p className={styles.footer}>{t("warmupCheckingFooter")}</p>
        </>
      ) : (
        <>
          <p className={styles.body}>{hint}</p>
          <p className={styles.timer}>
            {t("warmupWaitLabel")} <strong>{elapsedLabel}</strong>
          </p>
          <p className={styles.footer}>{t("warmupRetryFooter")}</p>
          <Link href="/offline" className={styles.offlineLink}>
            {t("offlineScreen")}
          </Link>
        </>
      )}
    </div>
  )
}

"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { Link, useRouter } from "@/i18n/navigation"
import { useAuth } from "@/hooks/useAuth"
import { canSeeAdminPanelNav } from "@/lib/adminDashboardNav"
import { getHttpApiBase } from "@/lib/apiBase"
import { getAuthToken } from "@/lib/auth"
import { apiFetch } from "@/lib/apiFetch"
import styles from "./admin.module.scss"

type AdminMember = {
  id: string
  email: string
  username: string
  nickname: string | null
  createdAt: string
  isActive: boolean
  isVip: boolean
  lastSeenAt: string | null
  avatarUrl: string | null
}

const NEW_MS = 7 * 24 * 60 * 60 * 1000

export default function AdminPage() {
  const t = useTranslations("admin")
  const router = useRouter()
  const { user, loading } = useAuth()
  const [members, setMembers] = useState<AdminMember[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadingList, setLoadingList] = useState(false)
  const [patchingId, setPatchingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    if (loading) return
    if (!user) {
      router.replace("/")
      return
    }
    if (!canSeeAdminPanelNav(user.username)) {
      router.replace("/chat")
    }
  }, [user, loading, router])

  const loadMembers = useCallback(async () => {
    const token = getAuthToken()
    if (!token) {
      setLoadError(t("noToken"))
      return
    }
    setLoadingList(true)
    setLoadError(null)
    try {
      const res = await apiFetch(`${getHttpApiBase()}/admin/members`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const body = await res.text()
        throw new Error(body || t("loadFailed", { status: res.status }))
      }
      const data = (await res.json()) as AdminMember[]
      setMembers(Array.isArray(data) ? data : [])
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : t("loadFailedGeneric"))
    } finally {
      setLoadingList(false)
    }
  }, [t])

  useEffect(() => {
    if (loading || !user || !canSeeAdminPanelNav(user.username)) return
    void loadMembers()
  }, [loadMembers, loading, user])

  const toggleVip = useCallback(
    async (member: AdminMember, nextVip: boolean) => {
      const token = getAuthToken()
      if (!token) return
      setPatchingId(member.id)
      try {
        const res = await apiFetch(`${getHttpApiBase()}/admin/members/${member.id}/vip`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ isVip: nextVip }),
        })
        if (!res.ok) {
          throw new Error(t("vipFailed", { status: res.status }))
        }
        const updated = (await res.json()) as Partial<AdminMember> & { id: string }
        setMembers((prev) =>
          prev.map((row) => (row.id === updated.id ? { ...row, isVip: Boolean(updated.isVip) } : row)),
        )
      } catch (e) {
        window.alert(e instanceof Error ? e.message : t("vipFailedGeneric"))
      } finally {
        setPatchingId(null)
      }
    },
    [t],
  )

  const deleteMember = useCallback(
    async (member: AdminMember) => {
      const token = getAuthToken()
      if (!token) {
        window.alert(t("noToken"))
        return
      }

      const displayName = member.nickname?.trim() || member.username
      const confirmed = window.confirm(
        t("deleteConfirm", {
          name: displayName,
          username: member.username,
        }),
      )
      if (!confirmed) {
        return
      }

      setDeletingId(member.id)
      try {
        const res = await apiFetch(`${getHttpApiBase()}/admin/members/${member.id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        })

        if (!res.ok) {
          throw new Error(t("deleteFailed", { status: res.status }))
        }

        setMembers((prev) => prev.filter((row) => row.id !== member.id))
      } catch (e) {
        window.alert(e instanceof Error ? e.message : t("deleteFailedGeneric"))
      } finally {
        setDeletingId(null)
      }
    },
    [t],
  )

  const sorted = useMemo(() => [...members].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)), [members])

  if (loading || !user || !canSeeAdminPanelNav(user.username)) {
    return (
      <div className={styles.page} aria-busy="true">
        <p className={styles.meta}>{t("loading")}</p>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <Link href="/chat" className={styles.backLink} prefetch>
          {t("backToChat")}
        </Link>
      </div>
      <h1 className={styles.title}>{t("title")}</h1>
      <p className={styles.meta}>{t("subtitle")}</p>

      {loadError ? <p className={styles.error}>{loadError}</p> : null}
      {loadingList ? <p className={styles.meta}>{t("loadingList")}</p> : null}

      <ul className={styles.list}>
        {sorted.map((m) => {
          const created = new Date(m.createdAt)
          const isNew = !Number.isNaN(created.getTime()) && Date.now() - created.getTime() < NEW_MS
          const lastSeenLabel = m.lastSeenAt
            ? new Date(m.lastSeenAt).toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              })
            : t("neverOnline")

          return (
            <li key={m.id} className={styles.card}>
              <div className={styles.cardHeader}>
                <div className={styles.nameRow}>
                  <span className={styles.displayName}>{m.nickname?.trim() || m.username}</span>
                  <span className={styles.handle}>@{m.username}</span>
                </div>
                <div className={styles.badgeRow}>
                  {isNew ? <span className={`${styles.badge} ${styles.badgeNew}`}>{t("badgeNew")}</span> : null}
                  {m.isVip ? <span className={`${styles.badge} ${styles.badgeVip}`}>VIP</span> : null}
                  <span className={`${styles.badge} ${m.isActive ? "" : styles.badgeOff}`}>
                    {m.isActive ? t("statusActive") : t("statusInactive")}
                  </span>
                </div>
              </div>
              <p className={styles.meta}>
                <strong>{t("labelId")}</strong> {m.id}
                <br />
                <strong>{t("labelEmail")}</strong> {m.email}
                <br />
                <strong>{t("labelJoined")}</strong> {created.toLocaleString()}
                <br />
                <strong>{t("labelLastSeen")}</strong> {lastSeenLabel}
              </p>
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.deleteBtn}
                  disabled={patchingId === m.id || deletingId === m.id}
                  onClick={() => void deleteMember(m)}
                >
                  {deletingId === m.id ? t("deleting") : t("deleteMember")}
                </button>
                <button
                  type="button"
                  className={`${styles.vipBtn} ${m.isVip ? styles.vipBtnOn : ""}`}
                  disabled={patchingId === m.id || deletingId === m.id}
                  onClick={() => void toggleVip(m, !m.isVip)}
                >
                  {m.isVip ? t("removeVip") : t("setVip")}
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

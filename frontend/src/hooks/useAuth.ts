"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "@/i18n/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/lib/apiFetch"
import { clearAppBadgeIfSupported } from "@/lib/appBadge"
import { clearPersistedReactQueryCache } from "@/lib/queryPersistConstants"
import { AUTH_ME_QUERY_ROOT, currentUserQueryKey } from "@/lib/queries/authQueries"
import { usersDirectoryQueryKey } from "@/lib/queries/usersQueries"
import {
  clearAuthToken,
  getAuthToken,
  hasClientAuthSessionHint,
  hasPersistedAccessTokenInWebStorage,
  setAuthToken,
} from "@/lib/auth"
import { saveRecentAuthIdentity } from "@/lib/authAutocomplete"
import { getHttpApiBase } from "@/lib/apiBase"
import { getNetworkFailureHint, messageFromApiResponseBody } from "@/lib/apiError"
import { recordDailyVisit } from "@/lib/appStreak"
import { filterTesterUsers } from "@/lib/testerUsers"
import { applyUserAppearanceToDocument } from "@/lib/userAppearance"

export type AuthUser = {
  id: string
  email: string
  username: string
  nickname?: string
  createdAt: string
  lastSeenAt?: string | null
  isActive: boolean
  isVip?: boolean
  avatarUrl?: string | null
  themeForegroundHex?: string | null
  themeBackgroundHex?: string | null
  themeFontKey?: string | null
}

export type AuthSessionPayload = {
  access_token: string
  user?: AuthUser
}

type SilentRefreshResult =
  | { kind: "ok"; payload: AuthSessionPayload }
  | { kind: "unauthorized" }
  | { kind: "transient" }

type UseAuthOptions = {
  redirectIfUnauthenticated?: string
}

function mergeUserIntoDirectoryList(
  list: AuthUser[] | undefined,
  nextUser: AuthUser,
): AuthUser[] | undefined {
  if (!Array.isArray(list)) {
    return list
  }
  let found = false
  const mapped = list.map((row) => {
    if (row.id !== nextUser.id) {
      return row
    }
    found = true
    return { ...row, ...nextUser }
  })
  return found ? mapped : list
}

export function useAuth(options?: UseAuthOptions) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const redirectIfUnauthenticated = options?.redirectIfUnauthenticated

  const [user, setUser] = useState<AuthUser | null>(null)
  const [users, setUsers] = useState<AuthUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const API_URL = getHttpApiBase()

  const setAuthenticatedUser = useCallback(
    (u: AuthUser) => {
      setUser(u)
      applyUserAppearanceToDocument(u)
      queryClient.setQueryData(currentUserQueryKey(u.id), u)
    },
    [queryClient],
  )

  const clearAuthenticatedUser = useCallback(() => {
    setUser(null)
    applyUserAppearanceToDocument(null)
    queryClient.removeQueries({ queryKey: AUTH_ME_QUERY_ROOT })
  }, [queryClient])

  const replaceUser = useCallback(
    (u: AuthUser) => {
      setAuthenticatedUser(u)
      queryClient.setQueryData(usersDirectoryQueryKey(), (list) =>
        mergeUserIntoDirectoryList(list as AuthUser[] | undefined, u),
      )
    },
    [queryClient, setAuthenticatedUser],
  )

  const patchUser = useCallback(
    (patch: Partial<AuthUser>) => {
      setUser((prev) => {
        if (!prev) {
          return null
        }
        const next = { ...prev, ...patch } as AuthUser
        queryClient.setQueryData(currentUserQueryKey(next.id), next)
        queryClient.setQueryData(usersDirectoryQueryKey(), (list) => {
          if (!Array.isArray(list)) {
            return list
          }
          return list.map((row) =>
            row.id === next.id ? ({ ...row, ...patch } as AuthUser) : row,
          )
        })
        applyUserAppearanceToDocument(next)
        return next
      })
    },
    [queryClient],
  )

  const fetchUsers = useCallback(async () => {
    const token = getAuthToken()

    if (!token) {
      setUsers([])
      queryClient.setQueryData(usersDirectoryQueryKey(), [])
      return
    }

    try {
      const res = await apiFetch(`${API_URL}/users`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        timeoutMs: 25_000,
      })

      if (!res.ok) {
        setUsers([])
        queryClient.setQueryData(usersDirectoryQueryKey(), [])
        return
      }

      const data = await res.json()
      const list = Array.isArray(data) ? filterTesterUsers(data as AuthUser[]) : []
      setUsers(list)
      queryClient.setQueryData(usersDirectoryQueryKey(), list)
    } catch {
      setUsers([])
      queryClient.setQueryData(usersDirectoryQueryKey(), [])
    }
  }, [API_URL, queryClient])

  const silentRefresh = useCallback(async (): Promise<SilentRefreshResult> => {
    try {
      const res = await apiFetch(`${API_URL}/auth/refresh`, {
        method: "POST",
        timeoutMs: 18_000,
      })
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          return { kind: "unauthorized" }
        }
        return { kind: "transient" }
      }
      const data = (await res.json()) as AuthSessionPayload
      if (typeof data.access_token !== "string" || data.access_token.length === 0) {
        return { kind: "transient" }
      }
      return { kind: "ok", payload: data }
    } catch {
      return { kind: "transient" }
    }
  }, [API_URL])

  const applyAuthPayload = useCallback(
    (data: AuthSessionPayload) => {
      setAuthToken(data.access_token)
      if (data.user) {
        setAuthenticatedUser(data.user)
        recordDailyVisit()
      }
      void fetchUsers()
    },
    [fetchUsers, setAuthenticatedUser],
  )

  /**
   * Silent refresh при старті (браузер і **PWA standalone**):
   * - немає access у **localStorage / sessionStorage** (див. `hasPersistedAccessTokenInWebStorage`) → одразу `POST /auth/refresh`;
   * - є збережений access → спочатку `GET /auth/me`, при 401/403 → refresh і повтор me.
   */
  const checkAuth = useCallback(async () => {
    const finishLoggedOut = () => {
      clearAuthToken()
      clearAuthenticatedUser()
      setUsers([])
      applyUserAppearanceToDocument(null)
      if (redirectIfUnauthenticated) {
        router.push(redirectIfUnauthenticated)
      }
    }

    const applyMeFromResponse = async (res: Response) => {
      const data = (await res.json()) as AuthUser
      setAuthenticatedUser(data)
      recordDailyVisit()
      await fetchUsers()
    }

    try {
      const persistedInWebStorage = hasPersistedAccessTokenInWebStorage()

      if (!persistedInWebStorage) {
        const refreshResult = await silentRefresh()
        if (refreshResult.kind === "unauthorized") {
          finishLoggedOut()
          return
        }
        if (refreshResult.kind === "transient") {
          return
        }
        const payloadFromRefresh = refreshResult.payload
        setAuthToken(payloadFromRefresh.access_token)
        if (payloadFromRefresh.user) {
          setAuthenticatedUser(payloadFromRefresh.user)
          recordDailyVisit()
          await fetchUsers()
          return
        }
        const tokenAfterRefresh = getAuthToken()
        if (!tokenAfterRefresh) {
          finishLoggedOut()
          return
        }
        const res = await apiFetch(`${API_URL}/auth/me`, {
          headers: { Authorization: `Bearer ${tokenAfterRefresh}` },
          timeoutMs: 18_000,
        })
        if (!res.ok) {
          finishLoggedOut()
          return
        }
        await applyMeFromResponse(res)
        return
      }

      let token = getAuthToken()
      if (!token) {
        const refreshResult = await silentRefresh()
        if (refreshResult.kind === "unauthorized") {
          finishLoggedOut()
          return
        }
        if (refreshResult.kind === "transient") {
          return
        }
        const payloadFromRefresh = refreshResult.payload
        setAuthToken(payloadFromRefresh.access_token)
        if (payloadFromRefresh.user) {
          setAuthenticatedUser(payloadFromRefresh.user)
          recordDailyVisit()
          await fetchUsers()
          return
        }
        token = getAuthToken()
        if (!token) {
          finishLoggedOut()
          return
        }
      }

      const res = await apiFetch(`${API_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
        timeoutMs: 18_000,
      })

      if (res.status === 401 || res.status === 403) {
        const refreshResult = await silentRefresh()
        if (refreshResult.kind === "unauthorized") {
          finishLoggedOut()
          return
        }
        if (refreshResult.kind === "transient") {
          return
        }
        const again = refreshResult.payload
        setAuthToken(again.access_token)
        if (again.user) {
          setAuthenticatedUser(again.user)
          recordDailyVisit()
          await fetchUsers()
          return
        }
        const retry = await apiFetch(`${API_URL}/auth/me`, {
          headers: { Authorization: `Bearer ${getAuthToken()}` },
          timeoutMs: 18_000,
        })
        if (!retry.ok) {
          finishLoggedOut()
          return
        }
        await applyMeFromResponse(retry)
        return
      }

      if (!res.ok) {
        return
      }

      await applyMeFromResponse(res)
    } catch {
      /* мережа / таймаут */
    } finally {
      setLoading(false)
    }
  }, [
    API_URL,
    clearAuthenticatedUser,
    fetchUsers,
    redirectIfUnauthenticated,
    router,
    setAuthenticatedUser,
    silentRefresh,
  ])

  const refreshSession = useCallback(async () => {
    const token = getAuthToken()
    if (token) {
      try {
        const res = await apiFetch(`${API_URL}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
          timeoutMs: 18_000,
        })
        if (res.ok) {
          const data = (await res.json()) as AuthUser
          replaceUser(data)
          recordDailyVisit()
          await fetchUsers()
          return
        }
      } catch {
        // переходимо до refresh
      }
    }

    if (!hasClientAuthSessionHint()) {
      return
    }
    const again = await silentRefresh()
    if (again.kind !== "ok") return
    const payload = again.payload
    setAuthToken(payload.access_token)
    if (payload.user) {
      setAuthenticatedUser(payload.user)
      recordDailyVisit()
    }
    await fetchUsers()
  }, [API_URL, fetchUsers, replaceUser, setAuthenticatedUser, silentRefresh])

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  const login = async (email: string, password: string) => {
    try {
      setIsSubmitting(true)
      setError(null)

      const res = await apiFetch(`${API_URL}/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
        timeoutMs: 60_000,
      })

      const text = await res.text()

      if (!res.ok) {
        throw new Error(
          messageFromApiResponseBody(text, res.status, "Не удалось войти. Попробуйте ещё раз."),
        )
      }

      const data = JSON.parse(text) as AuthSessionPayload

      setAuthToken(data.access_token)
      saveRecentAuthIdentity({
        email,
        username: typeof data?.user?.username === "string" ? data.user.username : undefined,
      })
      if (data.user) {
        setAuthenticatedUser(data.user)
        recordDailyVisit()
      } else {
        await refreshSession()
      }
      await fetchUsers()

      return true
    } catch (err: unknown) {
      setError(getNetworkFailureHint(err))
      return false
    } finally {
      setIsSubmitting(false)
    }
  }

  const logout = async () => {
    try {
      await apiFetch(`${API_URL}/auth/logout`, { method: "POST" })
    } catch {
      // все одно очищаємо стан клієнта
    }
    clearPersistedReactQueryCache()
    void clearAppBadgeIfSupported()
    queryClient.clear()
    clearAuthToken()
    setUser(null)
    setUsers([])
    applyUserAppearanceToDocument(null)
    router.push("/")
  }

  return {
    user,
    users,
    loading,
    error,
    isSubmitting,
    login,
    logout,
    refreshUsers: fetchUsers,
    refreshSession,
    applyAuthPayload,
    patchUser,
    replaceUser,
  }
}

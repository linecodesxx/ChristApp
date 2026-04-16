"use client"

import { useCallback, useEffect, useSyncExternalStore, useState } from "react"
import { useRouter } from "@/i18n/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/lib/apiFetch"
import { clearAppBadgeIfSupported } from "@/lib/appBadge"
import { clearPersistedReactQueryCache } from "@/lib/queryPersistConstants"
import { AUTH_ME_QUERY_ROOT, currentUserQueryKey } from "@/lib/queries/authQueries"
import { usersDirectoryQueryKey } from "@/lib/queries/usersQueries"
import { getAuthToken, setAuthToken } from "@/lib/auth"
import { saveRecentAuthIdentity } from "@/lib/authAutocomplete"
import { getHttpApiBase } from "@/lib/apiBase"
import { getNetworkFailureHint, messageFromApiResponseBody } from "@/lib/apiError"
import { recordDailyVisit } from "@/lib/appStreak"
import { filterTesterUsers } from "@/lib/testerUsers"
import { applyUserAppearanceToDocument } from "@/lib/userAppearance"
import {
  fetchCurrentUser,
  getAuthSessionSnapshot,
  initializeApp,
  loginWithPassword,
  logout as performLogout,
  patchAuthenticatedUser,
  refreshToken,
  setAuthenticatedUser as setAuthenticatedUserStore,
  subscribeAuthSession,
  type AuthSessionPayload,
  type AuthUser,
} from "@/lib/authSession"

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

  const [users, setUsers] = useState<AuthUser[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const authSnapshot = useSyncExternalStore(subscribeAuthSession, getAuthSessionSnapshot, getAuthSessionSnapshot)
  const user = authSnapshot.user
  const loading = !authSnapshot.initialized
  const API_URL = getHttpApiBase()

  const setAuthenticatedUser = useCallback(
    (u: AuthUser) => {
      setAuthenticatedUserStore(u)
      applyUserAppearanceToDocument(u)
      queryClient.setQueryData(currentUserQueryKey(u.id), u)
    },
    [queryClient],
  )

  const clearAuthenticatedUser = useCallback(() => {
    setAuthenticatedUserStore(null)
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
      if (!user) {
        return
      }
      const next = { ...user, ...patch } as AuthUser
      queryClient.setQueryData(currentUserQueryKey(next.id), next)
      queryClient.setQueryData(usersDirectoryQueryKey(), (list) => {
        if (!Array.isArray(list)) {
          return list
        }
        return list.map((row) => (row.id === next.id ? ({ ...row, ...patch } as AuthUser) : row))
      })
      applyUserAppearanceToDocument(next)
      patchAuthenticatedUser(patch)
    },
    [queryClient, user],
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

  const checkAuth = useCallback(async () => {
    try {
      await initializeApp()
      const snapshot = getAuthSessionSnapshot()
      if (!snapshot.user) {
        clearAuthenticatedUser()
        setUsers([])
        if (redirectIfUnauthenticated) {
          router.push(redirectIfUnauthenticated)
        }
        return
      }

      setAuthenticatedUser(snapshot.user)
      recordDailyVisit()
      await fetchUsers()
    } catch {
      clearAuthenticatedUser()
      setUsers([])
    }
  }, [
    clearAuthenticatedUser,
    fetchUsers,
    redirectIfUnauthenticated,
    router,
    setAuthenticatedUser,
  ])

  const refreshSession = useCallback(async () => {
    await refreshToken()
    const me = await fetchCurrentUser()
    replaceUser(me)
    recordDailyVisit()
    await fetchUsers()
  }, [fetchUsers, replaceUser])

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  const login = async (email: string, password: string) => {
    try {
      setIsSubmitting(true)
      setError(null)
      const data = await loginWithPassword(email, password)

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
      const rawMessage = err instanceof Error ? err.message : ""
      setError(messageFromApiResponseBody(rawMessage, 401, getNetworkFailureHint(err)))
      return false
    } finally {
      setIsSubmitting(false)
    }
  }

  const logout = async () => {
    clearPersistedReactQueryCache()
    void clearAppBadgeIfSupported()
    queryClient.clear()
    setUsers([])
    applyUserAppearanceToDocument(null)
    await performLogout({ redirectTo: "/" })
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

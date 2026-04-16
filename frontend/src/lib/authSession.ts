"use client"

import { getHttpApiBase } from "@/lib/apiBase"
import {
  clearAuthToken,
  getAuthToken,
  hasPersistedAccessTokenInWebStorage,
  readStoredAccessToken,
  setAuthToken,
} from "@/lib/auth"

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

type AuthSnapshot = {
  initialized: boolean
  user: AuthUser | null
}

type FailedQueueEntry = {
  resolve: (token: string) => void
  reject: (error: Error) => void
}

const API_URL = getHttpApiBase()

let authSnapshot: AuthSnapshot = {
  initialized: false,
  user: null,
}

let initializePromise: Promise<void> | null = null
let logoutPromise: Promise<void> | null = null
let isRefreshing = false
let failedQueue: FailedQueueEntry[] = []
const listeners = new Set<() => void>()

function emitAuthState() {
  listeners.forEach((listener) => listener())
}

function setAuthSnapshot(patch: Partial<AuthSnapshot>) {
  authSnapshot = { ...authSnapshot, ...patch }
  emitAuthState()
}

function rejectQueue(error: Error) {
  const queue = failedQueue
  failedQueue = []
  queue.forEach(({ reject }) => reject(error))
}

function resolveQueue(token: string) {
  const queue = failedQueue
  failedQueue = []
  queue.forEach(({ resolve }) => resolve(token))
}

function createUnauthorizedError(message = "Unauthorized") {
  return new Error(message)
}

async function refreshRequest(): Promise<AuthSessionPayload> {
  const response = await fetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    credentials: "include",
    cache: "no-store",
  })

  if (!response.ok) {
    throw createUnauthorizedError(`Refresh failed with status ${response.status}`)
  }

  const payload = (await response.json()) as AuthSessionPayload
  if (!payload?.access_token) {
    throw createUnauthorizedError("Refresh response does not contain access token")
  }

  return payload
}

export function subscribeAuthSession(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getAuthSessionSnapshot(): AuthSnapshot {
  return authSnapshot
}

export function setAuthenticatedUser(user: AuthUser | null) {
  setAuthSnapshot({ user })
}

export function patchAuthenticatedUser(patch: Partial<AuthUser>) {
  if (!authSnapshot.user) {
    return
  }
  setAuthSnapshot({
    user: {
      ...authSnapshot.user,
      ...patch,
    },
  })
}

export function markAuthInitialized() {
  if (!authSnapshot.initialized) {
    setAuthSnapshot({ initialized: true })
  }
}

export function resetClientAuthState() {
  clearAuthToken()
  setAuthSnapshot({
    user: null,
  })
}

export async function refreshToken(): Promise<string> {
  if (typeof window === "undefined") {
    throw createUnauthorizedError("Refresh is available only in browser")
  }

  if (isRefreshing) {
    return new Promise<string>((resolve, reject) => {
      failedQueue.push({ resolve, reject })
    })
  }

  isRefreshing = true

  try {
    const payload = await refreshRequest()
    setAuthToken(payload.access_token)
    if (payload.user) {
      setAuthenticatedUser(payload.user)
    }
    resolveQueue(payload.access_token)
    return payload.access_token
  } catch (error) {
    const authError = error instanceof Error ? error : createUnauthorizedError()
    rejectQueue(authError)
    resetClientAuthState()
    throw authError
  } finally {
    isRefreshing = false
  }
}

export async function ensureAccessToken(): Promise<string> {
  const token = getAuthToken()
  if (token) {
    return token
  }

  return refreshToken()
}

export async function initializeApp(): Promise<void> {
  if (typeof window === "undefined") {
    return
  }

  if (initializePromise) {
    return initializePromise
  }

  initializePromise = (async () => {
    const persistedToken = readStoredAccessToken()
    try {
      const freshToken = await refreshToken()
      const meResponse = await fetch(`${API_URL}/auth/me`, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${freshToken}`,
        },
      })

      if (!meResponse.ok) {
        throw createUnauthorizedError(`/auth/me failed with status ${meResponse.status}`)
      }

      const user = (await meResponse.json()) as AuthUser
      setAuthenticatedUser(user)
    } catch {
      if (persistedToken || hasPersistedAccessTokenInWebStorage()) {
        resetClientAuthState()
      } else {
        clearAuthToken()
        setAuthenticatedUser(null)
      }
    } finally {
      setAuthSnapshot({ initialized: true })
      initializePromise = null
    }
  })()

  return initializePromise
}

export async function loginWithPassword(email: string, password: string): Promise<AuthSessionPayload> {
  const response = await fetch(`${API_URL}/login`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  })

  const text = await response.text()
  if (!response.ok) {
    throw new Error(text || "Login failed")
  }

  const payload = JSON.parse(text) as AuthSessionPayload
  if (!payload?.access_token) {
    throw new Error("Login response does not contain access token")
  }

  setAuthToken(payload.access_token)
  if (payload.user) {
    setAuthenticatedUser(payload.user)
  }
  markAuthInitialized()
  return payload
}

export async function fetchCurrentUser(): Promise<AuthUser> {
  const token = await ensureAccessToken()
  const response = await fetch(`${API_URL}/auth/me`, {
    method: "GET",
    credentials: "include",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  if (!response.ok) {
    throw new Error(`/auth/me failed with status ${response.status}`)
  }

  const user = (await response.json()) as AuthUser
  setAuthenticatedUser(user)
  return user
}

export async function logout(options?: { redirectTo?: string; callBackend?: boolean }) {
  if (logoutPromise) {
    return logoutPromise
  }

  logoutPromise = (async () => {
    const redirectTo = options?.redirectTo ?? "/"
    const callBackend = options?.callBackend ?? true

    if (callBackend) {
      try {
        await fetch(`${API_URL}/auth/logout`, {
          method: "POST",
          credentials: "include",
        })
      } catch {
        // ignore backend logout errors during client teardown
      }
    }

    rejectQueue(createUnauthorizedError("Logged out"))
    isRefreshing = false
    resetClientAuthState()
    setAuthSnapshot({
      initialized: true,
      user: null,
    })

    if (typeof window !== "undefined") {
      window.location.assign(redirectTo)
    }
  })().finally(() => {
    logoutPromise = null
  })

  return logoutPromise
}

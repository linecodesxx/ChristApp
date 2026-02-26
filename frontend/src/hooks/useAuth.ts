"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { clearAuthToken, getAuthToken, setAuthToken } from "@/lib/auth"

type User = {
  id: string
  email: string
  username: string
  createdAt: string
}

type UseAuthOptions = {
  redirectIfUnauthenticated?: string
}

export function useAuth(options?: UseAuthOptions) {
  const router = useRouter()
  const redirectIfUnauthenticated = options?.redirectIfUnauthenticated

  const [user, setUser] = useState<User | null>(null)
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const API_URL = process.env.NEXT_PUBLIC_API_URL

  const fetchUsers = useCallback(async () => {
    const token = getAuthToken()

    if (!token || !API_URL) {
      setUsers([])
      return
    }

    try {
      const res = await fetch(`${API_URL}/users`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (!res.ok) {
        setUsers([])
        return
      }

      const data = await res.json()
      setUsers(Array.isArray(data) ? data : [])
    } catch {
      setUsers([])
    }
  }, [API_URL])

  // Проверка текущего пользователя
  const checkAuth = useCallback(async () => {
    const token = getAuthToken()

    if (!token) {
      if (redirectIfUnauthenticated) {
        router.push(redirectIfUnauthenticated)
      }
      setLoading(false)
      return
    }

    if (!API_URL) {
      setLoading(false)
      return
    }

    try {
      const res = await fetch(`${API_URL}/auth/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (res.status === 401 || res.status === 403) {
        clearAuthToken()
        setUser(null)
        setUsers([])

        if (redirectIfUnauthenticated) {
          router.push(redirectIfUnauthenticated)
        }

        return
      }

      if (!res.ok) {
        setLoading(false)
        return
      }

      const data = await res.json()
      setUser(data)
      await fetchUsers()
    } catch {
      setLoading(false)
      return
    } finally {
      setLoading(false)
    }
  }, [API_URL, fetchUsers, redirectIfUnauthenticated, router])

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  // Логин
  const login = async (email: string, password: string) => {
    try {
      setIsSubmitting(true)
      setError(null)

      if (!API_URL) {
        throw new Error("Не задан NEXT_PUBLIC_API_URL")
      }

      const res = await fetch(`${API_URL}/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      })

      if (!res.ok) {
        const contentType = res.headers.get("content-type") || ""

        if (contentType.includes("application/json")) {
          const errData = await res.json()
          throw new Error(errData.message || "Неверные данные")
        }

        throw new Error("Ошибка авторизации")
      }

      const data = await res.json()

      setAuthToken(data.access_token)
      setUser(data.user)
      await fetchUsers()

      return true
    } catch (err: any) {
      setError(err.message)
      return false
    } finally {
      setIsSubmitting(false)
    }
  }

  // Логаут
  const logout = () => {
    clearAuthToken()
    setUser(null)
    setUsers([])
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
  }
}

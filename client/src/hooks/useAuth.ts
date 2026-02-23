"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"

type User = {
  id: number
  email: string
  username: string
  createdAt: string
}

type UseAuthOptions = {
  redirectIfUnauthenticated?: string
}

export function useAuth(options?: UseAuthOptions) {
  const router = useRouter()

  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const API_URL = process.env.NEXT_PUBLIC_API_URL

  // Проверка текущего пользователя
  const checkAuth = useCallback(async () => {
    const token = localStorage.getItem("token")

    if (!token) {
      if (options?.redirectIfUnauthenticated) {
        router.push(options.redirectIfUnauthenticated)
      }
      setLoading(false)
      return
    }

    try {
      const res = await fetch(`${API_URL}/auth/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (!res.ok) throw new Error()

      const data = await res.json()
      setUser(data)
    } catch {
      localStorage.removeItem("token")
      setUser(null)

      if (options?.redirectIfUnauthenticated) {
        router.push(options.redirectIfUnauthenticated)
      }
    } finally {
      setLoading(false)
    }
  }, [API_URL, options, router])

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

      localStorage.setItem("token", data.access_token)
      setUser(data.user)

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
    localStorage.removeItem("token")
    setUser(null)
    router.push("/login")
  }

  return {
    user,
    loading,
    error,
    isSubmitting,
    login,
    logout,
  }
}

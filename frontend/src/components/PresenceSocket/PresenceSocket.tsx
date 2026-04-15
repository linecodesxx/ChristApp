"use client"

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import createSocket from "socket.io-client"
import { getDirectApiOrigin } from "@/lib/apiBase"
import { getAuthToken } from "@/lib/auth"
import { usePathname } from "@/i18n/navigation"

const WS_URL = getDirectApiOrigin()
const TOKEN_SYNC_INTERVAL_MS = 4000
type PresenceSocket = ReturnType<typeof createSocket>

type PresenceSocketContextValue = {
  socket: PresenceSocket | null
  isConnected: boolean
}

const PresenceSocketContext = createContext<PresenceSocketContextValue>({
  socket: null,
  isConnected: false,
})

export function usePresenceSocket() {
  return useContext(PresenceSocketContext)
}

type PresenceSocketProviderProps = {
  children: ReactNode
}

const PresenceSocketProvider = ({ children }: PresenceSocketProviderProps) => {
  const pathname = usePathname()
  const shouldUsePresenceSocket = pathname === "/chat" || !pathname?.startsWith("/chat/")
  const socketRef = useRef<PresenceSocket | null>(null)
  const currentTokenRef = useRef<string | null>(null)
  const [socket, setSocket] = useState<PresenceSocket | null>(null)
  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
    const syncPresenceSocket = () => {
      const token = getAuthToken()

      if (!token || !shouldUsePresenceSocket) {
        currentTokenRef.current = null
        setIsConnected(false)
        if (socketRef.current) {
          socketRef.current.disconnect()
          socketRef.current = null
        }
        setSocket(null)
        return
      }

      const hasTokenChanged = currentTokenRef.current !== token
      if (socketRef.current && !hasTokenChanged) {
        return
      }

      if (socketRef.current) {
        socketRef.current.disconnect()
      }

      const nextSocket = createSocket(WS_URL, {
        auth: { token },
        transports: ["websocket"],
      })
      nextSocket.on("connect", () => setIsConnected(true))
      nextSocket.on("disconnect", () => setIsConnected(false))

      socketRef.current = nextSocket
      setSocket(nextSocket)
      setIsConnected(nextSocket.connected)
      currentTokenRef.current = token
    }

    syncPresenceSocket()

    const intervalId = window.setInterval(syncPresenceSocket, TOKEN_SYNC_INTERVAL_MS)
    window.addEventListener("focus", syncPresenceSocket)
    window.addEventListener("storage", syncPresenceSocket)
    document.addEventListener("visibilitychange", syncPresenceSocket)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener("focus", syncPresenceSocket)
      window.removeEventListener("storage", syncPresenceSocket)
      document.removeEventListener("visibilitychange", syncPresenceSocket)

      if (socketRef.current) {
        socketRef.current.disconnect()
        socketRef.current = null
      }
      setSocket(null)
      setIsConnected(false)
    }
  }, [shouldUsePresenceSocket])

  const contextValue = useMemo(
    () => ({
      socket,
      isConnected,
    }),
    [isConnected, socket],
  )

  return <PresenceSocketContext.Provider value={contextValue}>{children}</PresenceSocketContext.Provider>
}

export default PresenceSocketProvider
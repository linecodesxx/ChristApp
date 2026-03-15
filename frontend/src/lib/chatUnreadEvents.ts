export const CHAT_UNREAD_CHANGED_EVENT = "chat:unread-changed"

export function dispatchChatUnreadChangedEvent() {
  if (typeof window === "undefined") {
    return
  }

  window.dispatchEvent(new CustomEvent(CHAT_UNREAD_CHANGED_EVENT))
}

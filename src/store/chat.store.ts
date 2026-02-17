import type { Message } from "@/types/message";

type Listener = () => void;

const state: { messages: Message[] } = {
  messages: [],
};

const listeners = new Set<Listener>();

export function getChatState() {
  return state;
}

export function setChatMessages(messages: Message[]) {
  state.messages = messages;
  listeners.forEach((listener) => listener());
}

export function subscribeChat(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
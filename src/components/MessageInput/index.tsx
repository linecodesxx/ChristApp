"use client"

import { useState } from "react"
import styles from "./MessageInput.module.scss"

type MessageInputProps = {
  onSend: (text: string) => Promise<void>
}

export default function MessageInput({ onSend }: MessageInputProps) {
  const [value, setValue] = useState("")

  const submit = async () => {
    const text = value.trim()
    if (!text) return
    await onSend(text)
    setValue("")
  }

  return (
    <div className={styles.wrapper}>
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Напиши сообщение..."
        className={styles.input}
      />
      <button type="button" onClick={submit} className={styles.button}>
        Отправить
      </button>
    </div>
  )
}

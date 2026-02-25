"use client"

import { useState } from "react"
import styles from "@/components/MessageInput/MessageInput.module.scss"
import Image from "next/image"

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
    <div className={styles.message}>
      <Image src="/icon-attachment.svg" alt="Add" width={20} height={20} className={styles.attachmentButton} />
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            submit()
          }
        }}
        placeholder="Напиши сообщение..."
        className={styles.input}
      />

      {value ? (
        <Image src="/icon-send.svg" className={styles.sendButton} alt="Send" width={18} height={18} onClick={submit} />
      ) : (
        <Image src="/icon-micro.svg" className={styles.microButton} alt="Send" width={36} height={36} onClick={submit} />
      )}
    </div>
  )
}

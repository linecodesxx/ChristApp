"use client"

import { AnimatePresence, motion } from "framer-motion"
import styles from "./IncomingCallModal.module.scss"

type IncomingCallModalProps = {
  open: boolean
  callerName: string
  onAccept: () => void
  onDecline: () => void
}

export default function IncomingCallModal({ open, callerName, onAccept, onDecline }: IncomingCallModalProps) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className={styles.backdrop}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.div
            className={styles.card}
            initial={{ y: 14, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 16, opacity: 0 }}
            transition={{ duration: 0.24, ease: "easeOut" }}
          >
            <h3 className={styles.title}>Incoming audio call</h3>
            <p className={styles.subtitle}>{callerName} is calling you (voice)</p>
            <div className={styles.actions}>
              <button type="button" className={`${styles.button} ${styles.decline}`} onClick={onDecline}>
                Decline
              </button>
              <button type="button" className={`${styles.button} ${styles.accept}`} onClick={onAccept}>
                Accept
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

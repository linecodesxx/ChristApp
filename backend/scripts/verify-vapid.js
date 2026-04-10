/**
 * Проверка VAPID из backend/.env:
 * 1) формат ключей (через web-push)
 * 2) публичный ключ действительно соответствует приватному (ECDH P-256)
 *
 * Запуск из каталога backend: npm run push:verify
 */
/* eslint-disable no-console */
const path = require("path")
const crypto = require("crypto")
const dotenv = require("dotenv")
const webpush = require("web-push")

dotenv.config({ path: path.resolve(__dirname, "..", ".env") })

function b64urlToBuf(s) {
  const pad = "=".repeat((4 - (s.length % 4)) % 4)
  return Buffer.from((s + pad).replace(/-/g, "+").replace(/_/g, "/"), "base64")
}

/** Восстанавливает публичный VAPID-ключ из приватного (как у web-push). */
function deriveVapidPublicKey(privateKeyB64Url) {
  let buf = b64urlToBuf(privateKeyB64Url)
  if (buf.length < 32) {
    buf = Buffer.concat([Buffer.alloc(32 - buf.length, 0), buf])
  }
  const ecdh = crypto.createECDH("prime256v1")
  ecdh.setPrivateKey(buf)
  return ecdh.getPublicKey(null, "uncompressed").toString("base64url")
}

function main() {
  const publicKey = process.env.WEB_PUSH_PUBLIC_KEY?.trim() || ""
  const privateKey = process.env.WEB_PUSH_PRIVATE_KEY?.trim() || ""
  const subject =
    process.env.WEB_PUSH_SUBJECT?.trim() || "mailto:notifications@christapp.local"

  if (!publicKey || !privateKey) {
    console.error("В .env нет WEB_PUSH_PUBLIC_KEY и/или WEB_PUSH_PRIVATE_KEY.")
    process.exit(1)
  }

  try {
    webpush.setVapidDetails(subject, publicKey, privateKey)
  } catch (e) {
    console.error("web-push отклонил ключи или subject:", e.message)
    process.exit(1)
  }

  let derived
  try {
    derived = deriveVapidPublicKey(privateKey)
  } catch (e) {
    console.error("Не удалось восстановить публичный ключ из приватного:", e.message)
    process.exit(1)
  }

  if (derived !== publicKey) {
    console.error("ОШИБКА: WEB_PUSH_PUBLIC_KEY не соответствует WEB_PUSH_PRIVATE_KEY.")
    console.error("  из .env public:", `${publicKey.slice(0, 16)}…${publicKey.slice(-12)}`)
    console.error("  из private ECDH:", `${derived.slice(0, 16)}…${derived.slice(-12)}`)
    console.error("Сгенерируй пару заново: npm run push:keys и обнови оба ключа в .env.")
    process.exit(1)
  }

  console.log("OK: публичный и приватный VAPID — одна пара, subject принят.")
  console.log(`WEB_PUSH_SUBJECT: ${subject}`)
  console.log(`WEB_PUSH_PUBLIC_KEY (${publicKey.length} символов):`)
  console.log(publicKey)
  console.log("")
  console.log("Сверь с живым API (поле publicKey должно совпадать с строкой выше):")
  console.log('  curl -sS -H "Authorization: Bearer <JWT>" "https://<API>/push/public-key"')
  console.log("")
  console.log("iPhone: если ключи меняли после подписок — в профиле снова «Подключить push»")
  console.log("или удали старые строки в таблице pushSubscription.")
}

main()

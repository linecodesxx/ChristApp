export default function OfflinePage() {
  return (
    <main style={{ minHeight: "70svh", display: "grid", placeItems: "center", textAlign: "center", padding: "24px" }}>
      <section>
        <h1 style={{ marginBottom: "10px" }}>Вы офлайн</h1>
        <p style={{ opacity: 0.85 }}>
          Подключитесь к интернету, чтобы продолжить работу с чатом и синхронизацией данных.
        </p>
      </section>
    </main>
  )
}

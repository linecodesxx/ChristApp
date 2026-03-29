import styles from "./contacts.module.scss"

const contacts = [
  {
    id: "eduard",
    name: "Eduard Sekan",
    role: "Frontend / UI/UX",
    telegram: "EEddy25",
    photo: "/ava1.jpg",
  },
  {
    id: "xho",
    name: "Xho Hristov",
    role: "Backend / DevOps",
    telegram: "blessed_xcho",
    photo: "/ava2.jpg",
  },
]

const Contacts = () => {
  return (
    <section className={styles.contacts}>
      <header className={styles.header}>
        <h1>Contacts</h1>
        <p>Свяжитесь с нами в Telegram</p>
      </header>

      <div className={styles.cards}>
        {contacts.map((contact) => (
          <article key={contact.id} className={styles.card}>
            <img className={styles.photo} src={contact.photo} alt={contact.name} loading="lazy" />

            <div className={styles.info}>
              <h2>{contact.name}</h2>
              <span>{contact.role}</span>
            </div>

            <a
              className={styles.telegramLink}
              href={`https://t.me/${contact.telegram}`}
              target="_blank"
              rel="noreferrer"
            >
              @{contact.telegram}
            </a>
          </article>
        ))}

        <div className={styles.appVersion}>
          <span>App version 0.0.3</span>
          <span>Authors: Ed Hristov, Xho Hristov</span>
        </div>
      </div>
    </section>
  )
}

export default Contacts

"use client"

import styles from "@/app/profile/profile.module.scss"
import { useAuth } from "@/hooks/useAuth"
import { formatMemberSince, getInitials } from "@/lib/utils"

const Profile = () => {
  const { user, logout, loading } = useAuth({ redirectIfUnauthenticated: "/" })

  if (loading || !user) {
    return null
  }

  const formattedDate = formatMemberSince(user?.createdAt)
  const initials = getInitials(user?.username)

  return (
    <>
      <section className={styles.profile}>
        <h1>Профиль</h1>

        <div className={styles.userInfo}>
          <div className={styles.avatar}>{initials}</div>
          <div className={styles.info}>
            <span className={styles.username}>{user?.username}</span>
            <span>Member since {formattedDate}</span>
          </div>
        </div>

        <ul className={styles.list}>
          <li className={styles.item}>Day Streak</li>
          <li className={styles.item}>Chapters</li>
          <li className={styles.item}>Badges</li>
        </ul>

        <div className={styles.account}>
          <span>Account</span>
          <ul>
            <li>Notifications</li>
            <li>Privacy & Security</li>
          </ul>
        </div>

        <div className={styles.support}>
          <span>Support</span>
          <ul>
            <li>Help Center </li>
            <li>About the App</li>
          </ul>

          <div>
            <a
              href="/"
              onClick={(event) => {
                event.preventDefault()
                logout()
              }}
            >
              Sign Out
            </a>
          </div>
        </div>
      </section>
    </>
  )
}

export default Profile

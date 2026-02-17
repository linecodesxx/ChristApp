"use client";

import { useRouter } from "next/navigation";
import styles from "./page.module.scss";

export default function LoginPage() {
  const router = useRouter();

  const handleLogin = () => {
    document.cookie = "auth=1; path=/";
    router.push("/chat");
  };

  return (
    <main className={`${styles.main} container`}>
      <h1>Вход</h1>
      <p className={styles.text}>Christ App</p>
      <button onClick={handleLogin} className={styles.button}>
        Войти
      </button>
    </main>
  );
}
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "../login/page.module.scss";

export default function RegisterPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const handleRegister = async () => {
    const res = await fetch("http://localhost:3001/auth/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, username, password }),
    });

    const data = await res.json();

    if (data.access_token) {
      localStorage.setItem("token", data.access_token);
      router.push("/chat");
    } else {
      alert("Ошибка регистрации");
    }
  };

  return (
    <main className={`${styles.main} container`}>
      <h1>Регистрация</h1>
      <input
        placeholder="Email"
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        placeholder="Username"
        onChange={(e) => setUsername(e.target.value)}
      />
      <input
        type="password"
        placeholder="Пароль"
        onChange={(e) => setPassword(e.target.value)}
      />
      <button onClick={handleRegister} className={styles.button}>
        Зарегистрироваться
      </button>
    </main>
  );
}

"use client"

export default function ShareButton() {
  const share = async () => {
    if (!navigator.share) {
      alert("Share не поддерживается")
      return
    }

    try {
      await navigator.share({
        title: "Мой сайт",
        text: "Посмотри эту страницу",
        url: window.location.href,
      })
    } catch (error) {
      console.log(error)
    }
  }

  return <button onClick={share}>Поделиться</button>
}

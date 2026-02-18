const { io } = require("socket.io-client");

// Вставь сюда JWT, который твой сервер будет проверять
const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI1NzgzZjRkZC1mYTY3LTQ1YmItODhjMy1jMTYyNzU2MGRlY2MiLCJ1c2VybmFtZSI6ImxpbmUiLCJpYXQiOjE3NzE0MDAxNzAsImV4cCI6MTc3MjAwNDk3MH0.guJyFRFjmzCJ-l9D-YXbp6voG6cV2Wem9Mvh9mQ1rME";

const socket = io("http://localhost:3000", {
  auth: { token },
});

socket.on("connect", () => {
  console.log("✅ Connected to server!");

  // Отправляем тестовое сообщение
   socket.emit("sendMessage", "Привет, сервер!");
});

socket.on("newMessage", (msg) => {
  console.log("💬 New message received:", msg);
});

socket.on("history", (messages) => {
  console.log("🕑 Message history:");
  messages.forEach((msg) => {
    console.log(`[${msg.createdAt}] ${msg.sender.username}: ${msg.content}`);
  });
});

socket.on("disconnect", () => {
  console.log("❌ Disconnected from server");
});

socket.on("connect_error", (err) => {
  console.error("🔥 Connection error:", err.message);
});

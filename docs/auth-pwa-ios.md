# Auth Tokens + Safari PWA (iOS)

Этот документ фиксирует все изменения, которые были сделаны в проекте по токенам, refresh-сессиям и поведению авторизации в PWA.

## Цель изменений

- Убрать внезапные logout при переходах между страницами.
- Убрать logout при `visibilitychange`/`focus`/`online` в PWA.
- Обеспечить рабочую авторизацию в Safari PWA, где блокируются cross-site cookies.
- Сделать доступ по access token минимум на 7 дней.

## Что было не так

1. Safari PWA (standalone) отправлял запросы к backend как cross-site.
2. HttpOnly `refreshToken` cookie backend-домена не отправлялся в `/auth/refresh`.
3. На клиенте были агрессивные refresh-триггеры, которые при ошибках быстро приводили к logout.
4. При инициализации сессии сначала дергался refresh, даже если валидный access token уже был в storage.

## Текущая модель авторизации

- Access token (JWT): живет 7 дней.
- Refresh token: HttpOnly cookie, сессия хранится в таблице `RefreshSession` (обычно 30 дней).
- Клиент сначала пытается использовать уже сохраненный access token.
- Refresh выполняется только когда нужен новый токен.
- Ошибки сети и временная недоступность backend не считаются причиной немедленного logout.

## Изменения во frontend

### 1) Same-origin HTTP proxy для Nest

Файл: `frontend/src/lib/apiBase.ts`

- По умолчанию HTTP-запросы идут через `/api/nest`.
- Прямой вызов backend разрешен только если `NEXT_PUBLIC_USE_DIRECT_API=1`.

Зачем:
- Для браузера запрос становится same-origin к фронту, а не прямым cross-origin к backend.

### 2) Rewrites в Next.js

Файл: `frontend/next.config.ts`

- Настроен rewrite:
  - `/api/nest/:path* -> ${BACKEND_PROXY_TARGET || NEXT_PUBLIC_API_URL || http://127.0.0.1:3001}/:path*`

Зачем:
- Прозрачный прокси всех HTTP вызовов к Nest API.

### 3) Отдельный auth proxy route для cookie-операций

Файл: `frontend/src/app/api/auth/[...path]/route.ts`

- Добавлен серверный proxy route для auth-эндпоинтов.
- На входе читает `refreshToken` cookie с фронтового домена.
- Форвардит cookie на backend.
- Обрабатывает `Set-Cookie` backend и переустанавливает cookie на фронтовый домен.

Зачем:
- Это ключ к Safari PWA: cookie становится first-party для фронтового origin.

### 4) Перевод authSession на auth proxy

Файл: `frontend/src/lib/authSession.ts`

- `login` теперь идет через `/api/auth/login`.
- `refresh` теперь идет через `/api/auth/auth/refresh`.
- `logout` теперь идет через `/api/auth/auth/logout`.

Зачем:
- Все cookie-чувствительные операции выполняются same-origin.

### 5) Безопасная инициализация сессии

Файл: `frontend/src/lib/authSession.ts`

- Сначала используется существующий access token из памяти/storage.
- Если `/auth/me` дал 401/403, только тогда выполняется refresh.
- При не-auth ошибках не происходит немедленный reset всей сессии.

Зачем:
- Убирает ложные logout при временных сбоях сети.

### 6) Обработка 401 в API interceptor

Файл: `frontend/src/lib/apiFetch.ts`

- Logout выполняется только при явно auth-ошибке (401/403 после refresh).
- Сетевые и transient ошибки не приводят к моментальному logout.

### 7) Триггеры refresh в UI

Файл: `frontend/src/components/AuthSessionSync/AuthSessionSync.tsx`

- Убрано принудительное `force=true` обновление на каждый `focus`/`visibility`.
- Refresh выполняется только когда token близок к истечению.
- При ошибке refresh logout делается только для auth-ошибок.

### 8) Типы и сборка

Файл: `frontend/src/hooks/useAuth.ts`

- Добавлен re-export типов `AuthSessionPayload` и `AuthUser` для устранения TS ошибки в build.

## Изменения в backend

### 1) Увеличен TTL access token

Файлы:
- `backend/src/auth/auth.module.ts`
- `backend/.env`

- `JWT_ACCESS_EXPIRES_IN` установлен в `7d`.

### 2) Расширенная диагностика refresh/login/logout

Файл: `backend/src/auth/auth.service.ts`

Добавлены детальные логи по auth-событиям:
- login success/failed
- refresh success/denied
- причины отказа (например, нет cookie)
- request metadata (`origin`, `referer`, `sec-fetch-site`, наличие cookie header и т.д.)

Зачем:
- Быстро отличать auth-проблему от cookie/CORS/transport-проблемы.

## Практический поток работы (как тестировать)

1. Открыть PWA в Safari (standalone) на iOS.
2. Полностью выйти из аккаунта и войти заново (важно для переустановки cookie на фронтовом домене).
3. Проверить:
   - переходы по страницам не делают logout;
   - сворачивание/разворачивание приложения не делает logout;
   - `/auth/me` работает с текущим access token;
   - refresh выполняется только при необходимости.

## Важные env-переменные

### Frontend (Vercel)

- `BACKEND_PROXY_TARGET` = URL backend (Render).
- `NEXT_PUBLIC_API_URL` = URL backend (fallback для proxy target).
- `NEXT_PUBLIC_USE_DIRECT_API` не ставить в `1` для PWA-сценария (иначе вернется прямой cross-site).

### Backend

- `CORS_ORIGIN` = точный origin фронта.
- `JWT_ACCESS_EXPIRES_IN=7d`.

## Почему это должно работать в Safari PWA

Safari PWA блокирует third-party cookie-сценарии. После введения same-origin auth proxy браузер видит запросы и cookie в контексте фронтового домена, а не backend-домена. Это убирает основной барьер с `refreshToken` в standalone PWA.

## Ограничения и примечания

- WebSocket соединения могут оставаться direct-origin и не зависят от refresh cookie логики.
- После любых изменений cookie-стратегии рекомендуется один раз перелогиниться.
- Если снова появляется `refresh denied: no refresh cookie`, сначала проверять origin запроса и какой путь был вызван (`/api/auth/...` или прямой backend URL).

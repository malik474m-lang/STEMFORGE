# Деплой STEMFORGE

## Вариант 0. Нативное приложение для Windows (.exe) 🖥️

Полностью автономная оболочка: Electron + встроенный сервер + **SQLite** (никакого внешнего PostgreSQL —
все данные в `%APPDATA%/STEMFORGE/stemforge.db`). Результат: инсталлятор `STEMFORGE-Setup-1.1.0.exe`
и портативная версия `STEMFORGE-Portable-1.1.0.exe`.

### Настоящее локальное разделение (бесплатно)
После установки откройте режим **Local AI** и нажмите «Установить Local AI». Программа через встроенный `uv.exe`
однократно установит управляемый Python 3.11 + `python-audio-separator`. Внешний Python не нужен.
При первом разделении скачаются открытые модели:
- BS-RoFormer — чистые vocals/instrumental;
- HTDemucs 6s — drums, bass, guitar, piano, other.

Runtime и модели хранятся в `%APPDATA%/STEMFORGE/`; потребуется несколько гигабайт диска.
API-ключи и оплата для Local AI не нужны. На CPU обработка может быть дольше длительности трека.

Для разделения дуэта на мужской/женский вокал добавьте бесплатный токен MVSep в `.env`:
`MVSEP_API_TOKEN=...` (получить: https://mvsep.com/user-api). Этот этап запускается только над чистым vocal-стемом.

### A. Сборка через GitHub Actions (ничего локально ставить не нужно)
1. Залейте репозиторий на GitHub.
2. Вкладка **Actions → Windows Desktop → Run workflow** (или push тега `v1.0.0`).
3. Через ~10 минут скачайте `.exe` из раздела **Artifacts** сборки.

### B. Сборка на своём Windows-компьютере
```powershell
git clone <репо> ; cd stemforge
npm ci
npm run desktop:dist       # соберёт веб + упакует NSIS в папку dist-desktop\
```
Нужны только Node.js 20+ и интернет (electron-builder сам скачает бинарники).
NSIS-инсталлятор: выбор папки установки, ярлык на рабочем столе и в меню «Пуск».

### Разработка desktop-версии (Windows/Mac/Linux)
```bash
npm run desktop:dev        # next dev + окно Electron с горячей перезагрузкой
```

### AI-ключ в desktop-версии
Создайте файл `.env` в папке данных (`Файл → Папка данных` в меню приложения):
```
REPLICATE_API_TOKEN=r8_xxxxxxxxxxxxxxxx
```
и перезапустите приложение — включатся Whisper, RVC, ACE-Step, Demucs.

---

# Веб-деплой

Приложение: Next.js 16 + PostgreSQL (Drizzle). Вся DSP-обработка идёт в браузере пользователя,
поэтому нагрузка на сервер минимальна — хватает самого маленького VPS.

---

## Вариант A. Docker на VPS (рекомендуется)

Нет лимитов на размер загружаемых файлов и длительность запросов — все AI-функции работают без ограничений.

```bash
# 1. Клонировать репозиторий
git clone <ваш-репо> && cd stemforge

# 2. (опционально) включить AI-функции
cp .env.example .env
# отредактировать .env и docker-compose.yml: задать REPLICATE_API_TOKEN

# 3. Собрать и запустить (поднимутся app + postgres)
docker compose up -d --build

# 4. Проверить
curl http://localhost:3000/api/health   # → {"ok":true}
```

Таблицы `projects` и `lyrics` создадутся автоматически при старте контейнера
(`scripts/init-db.cjs`, идемпотентно). Данные БД — в volume `pgdata`.

### Доступ по HTTPS
Поставьте перед приложением Caddy или Nginx:

```caddyfile
# Caddyfile — сертификаты выдаются автоматически
studio.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

> Для AI-разделения больших MP3 (до 60 МБ) в nginx увеличьте `client_max_body_size 64m;`
> и `proxy_read_timeout 120s;`.

### Обновление
```bash
git pull && docker compose up -d --build
```

---

## Вариант B. Vercel + Neon/Supabase (серверless)

Подходит для DSP-режима и текста. **Ограничения Vercel:**
- тело запроса ≤ 4.5 МБ (Hobby) → AI-режим разделения и транскрибация длинных MP3
  не пройдут без доработки загрузки через Vercel Blob;
- лимит времени функции: 60 с (Hobby) — генерация песни (2–5 мин) не успеет,
  но архитектура поллинга (`/api/ai/poll`) переживает таймауты создания задач.

Шаги:
1. Залейте код на GitHub.
2. Создайте Postgres на [Neon](https://neon.tech) (free tier) — скопируйте строку подключения.
3. Импортируйте репозиторий в Vercel → переменные окружения:
   - `DATABASE_URL` = строка Neon (с `?sslmode=require`)
   - `REPLICATE_API_TOKEN` = токен с https://replicate.com/account/api-tokens (опционально)
4. Deploy. Затем один раз инициализируйте схему:
   ```bash
   psql "$DATABASE_URL" -f scripts/init-db.cjs  # или выполните SQL из scripts/init-db.cjs в SQL-редакторе Neon
   ```

---

## Вариант C. Классический Node на VPS (без Docker)

```bash
npm ci
npm run build
DATABASE_URL=... nohup npm start -- -p 3000 &
```

Перед первым стартом инициализируйте БД: `node scripts/init-db.cjs`.
Для автозапуска — systemd unit:

```ini
[Unit]
Description=STEMFORGE
After=network.target

[Service]
WorkingDirectory=/opt/stemforge
Environment=DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/app_db
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm start
Restart=always

[Install]
WantedBy=multi-user.target
```

---

## Переменные окружения

| Переменная | Обязательна | Назначение |
|---|---|---|
| `DATABASE_URL` | да | Строка подключения PostgreSQL (история проектов и тексты песен) |
| `REPLICATE_API_TOKEN` | нет | Включает все AI-функции: Demucs-разделение, Whisper-транскрибацию, RVC-голос, ACE-Step |

Без `REPLICATE_API_TOKEN` приложение полностью работоспособно в локальном DSP-режиме:
разделение, микшер, запись голоса, эффекты, тексты и синхронизация — всё в браузере.

## Приложение на Windows

После деплоя откройте сайт в Chrome/Edge → меню ⋮ → «Установить приложение» —
STEMFORGE установится как отдельная программа с иконкой в меню «Пуск» (PWA-манифест уже настроен).

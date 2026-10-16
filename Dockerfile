# ---------- зависимости ----------
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# ---------- сборка ----------
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# нужен только для импорта модулей на этапе сборки (реального подключения нет)
ENV DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/app_db
RUN npm run build

# ---------- рантайм ----------
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup -S nodejs && adduser -S nextjs -G nodejs

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/scripts ./scripts

USER nextjs
EXPOSE 3000

# init-db создаёт таблицы (идемпотентно), затем стартует сервер
CMD ["sh", "-c", "node scripts/init-db.cjs && node server.js"]

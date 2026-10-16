/**
 * Инициализация схемы БД при старте контейнера.
 * Идемпотентно: CREATE TABLE IF NOT EXISTS.
 */
const { Client } = require("pg");

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("[init-db] DATABASE_URL не задан — пропускаю инициализацию");
  process.exit(0);
}

const DDL = `
CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  file_name text NOT NULL,
  duration_sec real NOT NULL,
  sample_rate integer NOT NULL,
  mode text NOT NULL DEFAULT 'dsp',
  stems jsonb NOT NULL,
  exports jsonb NOT NULL DEFAULT '[]'::jsonb,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lyrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid,
  file_name text NOT NULL,
  title text NOT NULL,
  plain_text text NOT NULL DEFAULT '',
  lines jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
`;

async function main() {
  const client = new Client({ connectionString: url });
  for (let attempt = 1; attempt <= 10; attempt++) {
    try {
      await client.connect();
      await client.query(DDL);
      console.log("[init-db] Схема БД готова");
      await client.end();
      return;
    } catch (e) {
      console.log(`[init-db] попытка ${attempt}/10: ${e.message}`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  console.warn("[init-db] БД недоступна — приложение стартует без инициализации");
}

main();

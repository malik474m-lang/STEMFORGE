import { desc, eq } from "drizzle-orm";
import type { StemSettings, ExportRecord, LyricLineData } from "@/db/schema";
import * as sqliteSchema from "@/db/schema.sqlite";

/**
 * Единый репозиторий данных.
 * Веб-режим: PostgreSQL (DATABASE_URL).
 * Десктоп-режим (Electron): SQLite-файл — DB_DRIVER=sqlite + SQLITE_PATH.
 * Драйвер выбирается лениво, чтобы приложение работало без DATABASE_URL.
 */

export interface ProjectInput {
  title: string;
  fileName: string;
  durationSec: number;
  sampleRate: number;
  mode: "local" | "dsp" | "ai";
  stems: StemSettings[];
  exports: ExportRecord[];
}

export interface ProjectPatch {
  title?: string;
  note?: string;
  stems?: StemSettings[];
  exports?: ExportRecord[];
}

export interface LyricsInput {
  title: string;
  fileName: string;
  plainText: string;
  lines: LyricLineData[];
  projectId: string | null;
}

export interface LyricsPatch {
  title?: string;
  plainText?: string;
  lines?: LyricLineData[];
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyRow = Record<string, any>;

function normalizeRow(row: AnyRow): AnyRow {
  const out = { ...row };
  for (const key of ["createdAt", "updatedAt"]) {
    if (out[key] instanceof Date) out[key] = out[key].toISOString();
    else if (typeof out[key] === "string") out[key] = out[key];
  }
  return out;
}

const useSqlite = process.env.DB_DRIVER === "sqlite";

/* ---------------- SQLite (desktop) ---------------- */

// drizzle-обёртка better-sqlite3 тянет нативный модуль при импорте,
// поэтому грузим её лениво и только в desktop-режиме
type SqliteDb = ReturnType<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (client: any, config?: { schema?: unknown }) => any
>;
let sqliteDb: SqliteDb | null = null;

async function getSqlite() {
  if (sqliteDb) return { db: sqliteDb, schema: sqliteSchema };
  const driverMod = await import("better-sqlite3");
  const Database = driverMod.default;
  const dbPath = process.env.SQLITE_PATH || "stemforge.db";
  const client = new Database(dbPath);
  client.pragma("journal_mode = WAL");
  client.exec(sqliteSchema.SQLITE_DDL);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { drizzle } = require("drizzle-orm/better-sqlite3") as {
    drizzle: (c: unknown, cfg?: { schema?: unknown }) => SqliteDb;
  };
  sqliteDb = drizzle(client, { schema: sqliteSchema });
  return { db: sqliteDb, schema: sqliteSchema };
}

/* ---------------- PostgreSQL (web) ---------------- */

let pgDb: (typeof import("@/db"))["db"] | null = null;
let pgSchema: typeof import("@/db/schema") | null = null;

async function getPg() {
  if (pgDb && pgSchema) return { db: pgDb, schema: pgSchema };
  const mod = await import("@/db");
  pgDb = mod.db;
  pgSchema = await import("@/db/schema");
  return { db: pgDb, schema: pgSchema };
}

/* ---------------- Репозиторий ---------------- */

export async function listProjects() {
  if (useSqlite) {
    const { db, schema } = await getSqlite();
    const rows = db.select().from(schema.projects).orderBy(desc(schema.projects.createdAt)).limit(50).all();
    return rows.map(normalizeRow);
  }
  const { db, schema } = await getPg();
  const rows = await db.select().from(schema.projects).orderBy(desc(schema.projects.createdAt)).limit(50);
  return rows.map(normalizeRow);
}

export async function createProject(input: ProjectInput) {
  if (useSqlite) {
    const { db, schema } = await getSqlite();
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    db.insert(schema.projects)
      .values({ id, createdAt, ...input })
      .run();
    return normalizeRow({ id, createdAt, note: null, ...input });
  }
  const { db, schema } = await getPg();
  const [row] = await db.insert(schema.projects).values({ ...input }).returning();
  return normalizeRow(row);
}

export async function updateProject(id: string, patch: ProjectPatch) {
  if (useSqlite) {
    const { db, schema } = await getSqlite();
    db.update(schema.projects).set(patch).where(eq(schema.projects.id, id)).run();
    const row = db.select().from(schema.projects).where(eq(schema.projects.id, id)).get();
    return row ? normalizeRow(row) : null;
  }
  const { db, schema } = await getPg();
  const [row] = await db.update(schema.projects).set(patch).where(eq(schema.projects.id, id)).returning();
  return row ? normalizeRow(row) : null;
}

export async function deleteProject(id: string) {
  if (useSqlite) {
    const { db, schema } = await getSqlite();
    db.delete(schema.projects).where(eq(schema.projects.id, id)).run();
    return;
  }
  const { db, schema } = await getPg();
  await db.delete(schema.projects).where(eq(schema.projects.id, id));
}

export async function listLyrics() {
  if (useSqlite) {
    const { db, schema } = await getSqlite();
    const rows = db.select().from(schema.lyrics).orderBy(desc(schema.lyrics.updatedAt)).limit(30).all();
    return rows.map(normalizeRow);
  }
  const { db, schema } = await getPg();
  const rows = await db.select().from(schema.lyrics).orderBy(desc(schema.lyrics.updatedAt)).limit(30);
  return rows.map(normalizeRow);
}

export async function createLyrics(input: LyricsInput) {
  if (useSqlite) {
    const { db, schema } = await getSqlite();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    db.insert(schema.lyrics)
      .values({ id, createdAt: now, updatedAt: now, ...input })
      .run();
    return normalizeRow({ id, createdAt: now, updatedAt: now, ...input });
  }
  const { db, schema } = await getPg();
  const [row] = await db.insert(schema.lyrics).values({ ...input }).returning();
  return normalizeRow(row);
}

export async function updateLyrics(id: string, patch: LyricsPatch) {
  if (useSqlite) {
    const { db, schema } = await getSqlite();
    db.update(schema.lyrics)
      .set({ ...patch, updatedAt: new Date().toISOString() })
      .where(eq(schema.lyrics.id, id))
      .run();
    const row = db.select().from(schema.lyrics).where(eq(schema.lyrics.id, id)).get();
    return row ? normalizeRow(row) : null;
  }
  const { db, schema } = await getPg();
  const [row] = await db
    .update(schema.lyrics)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(schema.lyrics.id, id))
    .returning();
  return row ? normalizeRow(row) : null;
}

export async function deleteLyrics(id: string) {
  if (useSqlite) {
    const { db, schema } = await getSqlite();
    db.delete(schema.lyrics).where(eq(schema.lyrics.id, id)).run();
    return;
  }
  const { db, schema } = await getPg();
  await db.delete(schema.lyrics).where(eq(schema.lyrics.id, id));
}

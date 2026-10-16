import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { ExportRecord, LyricLineData, StemSettings } from "./schema";

/**
 * SQLite-вариант схемы для десктопной (Electron) сборки —
 * приложение полностью автономно, без внешнего PostgreSQL.
 */
export const projects = sqliteTable("projects", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  title: text("title").notNull(),
  fileName: text("file_name").notNull(),
  durationSec: real("duration_sec").notNull(),
  sampleRate: integer("sample_rate").notNull(),
  mode: text("mode").notNull().default("dsp"),
  stems: text("stems", { mode: "json" }).$type<StemSettings[]>().notNull(),
  exports: text("exports", { mode: "json" })
    .$type<ExportRecord[]>()
    .notNull()
    .$defaultFn(() => []),
  note: text("note"),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const lyrics = sqliteTable("lyrics", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  projectId: text("project_id"),
  fileName: text("file_name").notNull(),
  title: text("title").notNull(),
  plainText: text("plain_text").notNull().default(""),
  lines: text("lines", { mode: "json" }).$type<LyricLineData[]>().notNull(),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const SQLITE_DDL = `
CREATE TABLE IF NOT EXISTS projects (
  id text PRIMARY KEY,
  title text NOT NULL,
  file_name text NOT NULL,
  duration_sec real NOT NULL,
  sample_rate integer NOT NULL,
  mode text NOT NULL DEFAULT 'dsp',
  stems text NOT NULL,
  exports text NOT NULL DEFAULT '[]',
  note text,
  created_at text NOT NULL
);
CREATE TABLE IF NOT EXISTS lyrics (
  id text PRIMARY KEY,
  project_id text,
  file_name text NOT NULL,
  title text NOT NULL,
  plain_text text NOT NULL DEFAULT '',
  lines text NOT NULL,
  created_at text NOT NULL,
  updated_at text NOT NULL
);
`;

import { integer, jsonb, pgTable, real, text, timestamp, uuid } from "drizzle-orm/pg-core";

export interface StemSettings {
  id: string;
  volume: number;
  muted: boolean;
  solo: boolean;
  enhance: boolean;
}

export interface ExportRecord {
  at: string;
  format: string;
  stems: string[];
}

export const projects = pgTable("projects", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").notNull(),
  fileName: text("file_name").notNull(),
  durationSec: real("duration_sec").notNull(),
  sampleRate: integer("sample_rate").notNull(),
  mode: text("mode").notNull().default("dsp"),
  stems: jsonb("stems").$type<StemSettings[]>().notNull(),
  exports: jsonb("exports").$type<ExportRecord[]>().notNull().default([]),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ProjectRow = typeof projects.$inferSelect;
export type NewProjectRow = typeof projects.$inferInsert;

export interface LyricLineData {
  id: string;
  time: number | null;
  text: string;
}

export const lyrics = pgTable("lyrics", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id"),
  fileName: text("file_name").notNull(),
  title: text("title").notNull(),
  plainText: text("plain_text").notNull().default(""),
  lines: jsonb("lines").$type<LyricLineData[]>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type LyricsRow = typeof lyrics.$inferSelect;

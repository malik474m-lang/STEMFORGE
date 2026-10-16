import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Проверка живости сервера и хранилища данных.
 * Драйвер выбирается лениво: desktop (SQLite) не требует DATABASE_URL.
 */
export async function GET() {
  try {
    if (process.env.DB_DRIVER === "sqlite") {
      const { listProjects } = await import("@/server/repo");
      await listProjects();
      return NextResponse.json({ ok: true, driver: "sqlite" });
    }
    const { db } = await import("@/db");
    const { sql } = await import("drizzle-orm");
    await db.execute(sql`select 1`);
    return NextResponse.json({ ok: true, driver: "pg" });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

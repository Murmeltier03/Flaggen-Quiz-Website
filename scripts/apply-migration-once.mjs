import { readFile } from "node:fs/promises";
import pg from "pg";

const connectionString = process.env.POSTGRES_URL;

if (!connectionString) {
  console.log("[migration] POSTGRES_URL ist nicht gesetzt; lokale Migration übersprungen.");
  process.exit(0);
}

if (process.env.VERCEL && process.env.VERCEL_ENV !== "production") {
  console.log("[migration] Kein Production-Build; Migration übersprungen.");
  process.exit(0);
}

const databaseUrl = new URL(connectionString);
databaseUrl.searchParams.set("sslmode", "require");
databaseUrl.searchParams.set("uselibpqcompat", "true");

const migrationSql = await readFile(
  new URL("../supabase/migrations/20260715210132_improve_profiles_stats_scoring.sql", import.meta.url),
  "utf8",
);
const client = new pg.Client({ connectionString: databaseUrl.toString() });

try {
  await client.connect();
  await client.query("begin");
  await client.query("select pg_advisory_xact_lock(485968303212543767::bigint)");
  await client.query(migrationSql);
  await client.query("commit");
  console.log("[migration] Profil-, Statistik- und Zeitwertungs-Migration ist bereit.");
} catch (error) {
  await client.query("rollback").catch(() => undefined);
  console.error("[migration] Migration fehlgeschlagen:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}

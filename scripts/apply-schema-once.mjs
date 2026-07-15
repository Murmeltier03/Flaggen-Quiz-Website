import { readFile } from "node:fs/promises";
import pg from "pg";

const databaseUrl =
  process.env.POSTGRES_URL ?? process.env.POSTGRES_URL_NON_POOLING;

if (!databaseUrl) {
  throw new Error("The Supabase/Vercel Postgres connection is unavailable.");
}

const schema = await readFile(new URL("../supabase/schema.sql", import.meta.url), "utf8");
const client = new pg.Client({ connectionString: databaseUrl });

await client.connect();

try {
  await client.query("begin");
  await client.query(schema);
  await client.query("commit");
  console.log("Supabase schema is ready.");
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  await client.end();
}

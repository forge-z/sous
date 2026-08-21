import { readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

const client = postgres(process.env.DATABASE_URL ?? "postgres://sous:sous@localhost:5432/sous", { prepare: false });

try {
  await client.unsafe(await readFile(path.join(process.cwd(), "drizzle/0000_init.sql"), "utf8"));
  console.log("Sous database is ready.");
} finally {
  await client.end();
}

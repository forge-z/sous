import postgres from "postgres";

const globalForSous = globalThis as unknown as { sql?: ReturnType<typeof postgres> };

export const sql = globalForSous.sql ?? postgres(
  process.env.DATABASE_URL ?? "postgres://sous:sous@localhost:5432/sous",
  { max: 10, prepare: false }
);

if (process.env.NODE_ENV !== "production") globalForSous.sql = sql;

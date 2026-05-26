import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("Missing DATABASE_URL");
}

const client = postgres(connectionString, {
  prepare: false,
  max: 10,
});

export const db = drizzle(client);
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

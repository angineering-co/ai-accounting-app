import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

// Lazy init via Proxy: defers connection + env validation until `db` is first
// used. Keeps the simple `import { db } from "@/lib/db/drizzle"` API while
// avoiding two failure modes that would bite a top-level `throw`:
//   (a) `next build` page-data collection imports any module the build touches;
//       a missing DATABASE_URL in build env would crash the whole build.
//   (b) vitest loads test files eagerly; `describe.skipIf(!hasDbEnv)` skips
//       the tests but cannot prevent the module-level throw from killing the
//       runner.
type DrizzleDb = ReturnType<typeof drizzle>;
let instance: DrizzleDb | null = null;

export const db = new Proxy({} as DrizzleDb, {
  get(_target, prop, receiver) {
    if (!instance) {
      // Prefer DATABASE_URL (what we set locally + can override in prod), fall
      // back to POSTGRES_URL (auto-provisioned by the Vercel-Supabase
      // integration as the Supavisor transaction-mode URL). Either is the
      // same shape; the fallback removes a manual sync step on Vercel.
      const connectionString =
        process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
      if (!connectionString) {
        throw new Error("Missing DATABASE_URL (or POSTGRES_URL)");
      }
      const client = postgres(connectionString, {
        prepare: false,
        max: 10,
      });
      instance = drizzle(client);
    }
    return Reflect.get(instance, prop, receiver);
  },
});

export type Tx = Parameters<Parameters<DrizzleDb["transaction"]>[0]>[0];

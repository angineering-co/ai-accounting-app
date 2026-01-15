import path from "path";
import { loadEnvConfig } from "@next/env";
import { config as loadDotenv } from "dotenv";

const projectRoot = path.resolve(__dirname, "..");
loadDotenv({ path: path.join(projectRoot, ".env.local") });
loadEnvConfig(projectRoot, true);

const requiredEnvVars = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(
      `Missing required env var for tests: ${envVar}. ` +
        "Start local Supabase and export its keys before running tests."
    );
  }
}

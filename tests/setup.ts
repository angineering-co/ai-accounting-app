import path from "path";
import { loadEnvConfig } from "@next/env";
import { config as loadDotenv } from "dotenv";

const projectRoot = path.resolve(__dirname, "..");
loadDotenv({ path: path.join(projectRoot, ".env.local") });
loadEnvConfig(projectRoot, true);

const requiredEnvVars = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "DATABASE_URL",
];

const missingEnvVars = requiredEnvVars.filter(
  (envVar) => !process.env[envVar]
);

if (missingEnvVars.length > 0) {
  // Warn instead of throwing — component tests (jsdom) don't need Supabase.
  // Integration tests will fail at runtime if they try to use a missing client.
  console.warn(
    `⚠ Missing env vars for DB tests: ${missingEnvVars.join(", ")}. ` +
      "Integration tests will be skipped. Start local Supabase for full test suite."
  );
}

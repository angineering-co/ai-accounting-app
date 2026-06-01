import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  {
    ignores: [".next/**", "examples/**", "playwright-report/**"],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    // Drizzle-kit pull generates schema.ts / relations.ts; do not lint against
    // unused-vars (drizzle emits unused `table` callback args for tables that
    // declare only policies and no FK/index/check).
    files: ["lib/db/schema.ts", "lib/db/relations.ts"],
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
];

export default eslintConfig;

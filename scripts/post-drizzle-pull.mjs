import { readFileSync, writeFileSync, existsSync, rmSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";

const dbDir = "lib/db";
const schemaPath = join(dbDir, "schema.ts");
const relationsPath = join(dbDir, "relations.ts");

if (!existsSync(schemaPath)) {
  console.error(`post-drizzle-pull: ${schemaPath} not found. Did drizzle-kit pull run?`);
  process.exit(1);
}

// drizzle-kit pull with schemaFilter: ["public"] generates dangling references
// to auth.users: bare `users` in schema.ts (FK on profiles.id) and `usersInAuth`
// in relations.ts. Pulling the auth schema instead triggers a separate
// drizzle-kit codegen bug (empty-string defaults render as `default(')`,
// unterminated string).
//
// drizzle-orm ships a canonical auth.users definition at `drizzle-orm/supabase`
// (exported as `authUsers`). We rewire the generated imports to use it.

const SUPABASE_IMPORT_MARKER = `from "drizzle-orm/supabase"`;

// --- schema.ts: prepend `import { authUsers as users } ...` if not present ---
{
  let src = readFileSync(schemaPath, "utf8");
  if (!src.includes(SUPABASE_IMPORT_MARKER)) {
    const importLine = `import { authUsers as users } from "drizzle-orm/supabase";\n`;
    src = importLine + src;
    writeFileSync(schemaPath, src);
    console.log(`post-drizzle-pull: rewired auth.users import in ${schemaPath}`);
  } else {
    console.log(`post-drizzle-pull: auth.users import already present in ${schemaPath}`);
  }
}

// --- relations.ts: drop `usersInAuth` from the `./schema` import only, add canonical one ---
if (existsSync(relationsPath)) {
  let src = readFileSync(relationsPath, "utf8");
  if (!src.includes(SUPABASE_IMPORT_MARKER)) {
    // Match the entire `import { ... } from "./schema"` statement and rewrite
    // only its named-import list. Operating on the whole file with a broader
    // regex is unsafe — `usersInAuth, ` also appears at call sites like
    // `one(usersInAuth, { ... })` and must not be touched there.
    src = src.replace(
      /(import\s*\{)([^}]+)(\}\s*from\s*["']\.\/schema["'])/,
      (_match, open, list, close) => {
        const names = list
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s && s !== "usersInAuth");
        return `${open} ${names.join(", ")} ${close}`;
      },
    );

    // Prepend the canonical import. Place after the first existing import line for tidiness.
    const lines = src.split("\n");
    const firstImportIdx = lines.findIndex((l) => l.startsWith("import "));
    const insertAt = firstImportIdx >= 0 ? firstImportIdx + 1 : 0;
    lines.splice(insertAt, 0, `import { authUsers as usersInAuth } from "drizzle-orm/supabase";`);
    src = lines.join("\n");

    writeFileSync(relationsPath, src);
    console.log(`post-drizzle-pull: rewired auth.users import in ${relationsPath}`);
  } else {
    console.log(`post-drizzle-pull: auth.users import already present in ${relationsPath}`);
  }
}

// Drop the snapshot SQL drizzle-kit emits next to schema.ts. We do not use it
// (supabase/migrations is the source of truth).
const sqlSnapshots = readdirSync(dbDir).filter((f) => /^\d+_.*\.sql$/.test(f));
for (const f of sqlSnapshots) {
  unlinkSync(join(dbDir, f));
  console.log(`post-drizzle-pull: removed ${join(dbDir, f)}`);
}

// Drop the meta/ folder; drizzle-kit uses it only to compute pull diffs on
// repeat runs, which we don't rely on (we pull from a fresh local DB).
const metaPath = join(dbDir, "meta");
if (existsSync(metaPath)) {
  rmSync(metaPath, { recursive: true, force: true });
  console.log(`post-drizzle-pull: removed ${metaPath}`);
}

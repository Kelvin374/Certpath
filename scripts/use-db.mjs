#!/usr/bin/env node
/**
 * Switches `prisma/schema.prisma` between the SQLite (development) and
 * PostgreSQL (production) dialects.
 *
 *   node scripts/use-db.mjs            # auto-detect from DATABASE_URL
 *   node scripts/use-db.mjs sqlite
 *   node scripts/use-db.mjs postgres
 */
import { existsSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const prismaDir = join(here, "..", "prisma");
const target = join(prismaDir, "schema.prisma");

const VARIANTS = {
  sqlite: join(prismaDir, "schema.sqlite.prisma"),
  postgres: join(prismaDir, "schema.postgres.prisma"),
};

function detect() {
  const url = process.env.DATABASE_URL ?? "";
  if (/^postgres(ql)?:\/\//i.test(url)) return "postgres";
  if (/^file:/i.test(url)) return "sqlite";
  return "sqlite";
}

const arg = (process.argv[2] ?? "").toLowerCase();
const choice = VARIANTS[arg] ? arg : detect();
const source = VARIANTS[choice];

if (!existsSync(source)) {
  console.error(`[use-db] missing schema variant: ${source}`);
  process.exit(1);
}

const contents = readFileSync(source, "utf8");
const current = existsSync(target) ? readFileSync(target, "utf8") : "";

if (contents === current) {
  console.log(`[use-db] prisma/schema.prisma already uses the ${choice} dialect.`);
} else {
  copyFileSync(source, target);
  console.log(`[use-db] prisma/schema.prisma now uses the ${choice} dialect.`);
}

// Keep the local SQLite file database in the right place for the SQLite dialect.
if (choice === "sqlite") {
  const envPath = join(here, "..", ".env");
  const example = join(here, "..", ".env.example");
  if (!existsSync(envPath) && existsSync(example)) {
    copyFileSync(example, envPath);
    console.log("[use-db] created .env from .env.example");
  }
}

console.log(`[use-db] next: npx prisma generate && npx prisma db push`);

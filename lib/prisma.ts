import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

/**
 * Shared PrismaClient singleton.
 *
 * Prisma 7 needs a driver adapter at runtime (the CLI/migration
 * pipeline uses the schema engine binary directly, so it doesn't,
 * but anything calling PrismaClient at runtime does).
 *
 * Re-using one client across hot reloads keeps us from leaking
 * pools in dev. The pattern is the standard Next.js-with-Prisma
 * one: a module-scoped `prisma` in prod, and a cached copy on
 * `globalThis` during development so HMR keeps the same instance.
 *
 * ── Vercel / Neon tuning ──────────────────────────────────────────────────
 * The serverless runtime holds the function for ~10s max before
 * freezing, so we deliberately cap the underlying `pg` pool to a
 * small number of connections (Neon's pooler gives us the real
 * capacity; the local pool is just the per-instance budget).
 * Without this cap, a single warm lambda can hold dozens of
 * sockets, blowing through Neon's connection budget the moment
 * concurrent invocations spin up.
 */

declare global {
  // eslint-disable-next-line no-var
  var __khaidaiPrisma: PrismaClient | undefined;
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is not set. Add it to .env (local) or to the Vercel " +
      "project's Environment Variables (production).",
  );
}

// Build a `pg.Pool` ourselves (instead of letting `PrismaPg`
// construct one from `connectionString`) so we can pin the
// per-instance connection cap. `statement_timeout` is set as a
// Postgres session option so a runaway query can't hang the
// function past the 10s execution window.
const pool = new Pool({
  connectionString: databaseUrl,
  max: 3,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 5_000,
  // 5s query timeout — see comment above.
  statement_timeout: 5_000,
});

const adapter = new PrismaPg(pool);

export const prisma =
  globalThis.__khaidaiPrisma ??
  new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["warn", "error"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__khaidaiPrisma = prisma;
}

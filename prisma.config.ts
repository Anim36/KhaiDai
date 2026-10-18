import "dotenv/config";
import { defineConfig, env } from "prisma/config";

/**
 * Prisma v7 config. The datasource URL now lives here instead of
 * inside schema.prisma. Loading `dotenv/config` at the top makes
 * process.env.DATABASE_URL available to the env() helper, so
 * `prisma migrate dev`, `prisma db push`, `prisma studio`, and
 * `prisma generate` all read from this file.
 *
 * ── DATABASE_URL vs DIRECT_URL (Vercel + Neon) ─────────────────────────────
 *   • `DATABASE_URL`  — Neon's **pooled** connection string
 *                       (host ends in `-pooler.neon.tech`). Used by
 *                       the runtime `lib/prisma.ts` singleton and by
 *                       Prisma Studio.
 *   • `DIRECT_URL`    — Neon's **unpooled** connection string
 *                       (plain `*.neon.tech` hostname). Used by
 *                       `prisma migrate deploy` because the pooler
 *                       cannot service long-lived migrations.
 *
 * In local dev both point at the same `localhost:5432` database.
 *
 * NOTE — Prisma 7's `defineConfig` only exposes `datasource.url`
 * and `datasource.shadowDatabaseUrl`; `migrations.url` and
 * `datasource.directUrl` are NOT in the public config shape. The
 * workaround is to set `DATABASE_URL` to the **unpooled**
 * connection when running migrations on Vercel, and the pooled
 * string for runtime queries. The `prisma deploy` step in
 * `vercel.json` runs `prisma migrate deploy` with `DIRECT_URL`
 * masquerading as `DATABASE_URL`; the runtime lib reads
 * `DATABASE_URL` which is the pooler. Document this in the
 * deployment runbook.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    // Seed script intentionally disabled — see prisma/seed.ts
    // header. We no longer insert demo restaurants on
    // `migrate deploy` so the customer app only shows real
    // partner-owned rows.
    seed: "",
  },
  datasource: {
    // Default `url` is what `migrate` / `db push` / Studio use.
    // On Vercel this is overridden to `DIRECT_URL` (unpooled)
    // during the build step (see `vercel.json`'s env block).
    url: env("DATABASE_URL"),
  },
});

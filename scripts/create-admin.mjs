// scripts/create-admin.mjs — create the first platform-admin account.
//
// Modes (auto-detected from argv):
//
//   1. PROMOTE  — `node scripts/create-admin.mjs --email you@example.com`
//                 If a user with that email already exists, flip their
//                 role to ADMIN. If they don't exist, fall through to
//                 CREATE (we'll prompt for name + password).
//
//   2. CREATE   — `node scripts/create-admin.mjs --email you@example.com --name "Your Name"`
//                 `--name` is optional; you'll be prompted if absent.
//                 `--password` is optional; you'll be prompted if absent.
//                 Creates a new User row with role=ADMIN and a bcrypt-
//                 hashed password.
//
// All flags are `--key value` (space separated). Examples:
//
//   node scripts/create-admin.mjs --email admin@khaidai.test
//     → user exists? promote them. otherwise prompt for name+password.
//
//   node scripts/create-admin.mjs --email admin@khaidai.test --password hunter2
//     → user exists? promote + reset password. otherwise create with
//        the supplied password (no prompt).
//
//   node scripts/create-admin.mjs --email admin@khaidai.test --name "Admin" --password hunter2
//     → fully non-interactive create.
//
// The script is intentionally idempotent: re-running with the same
// email after a previous create-or-promote just no-ops and prints the
// final state.

import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import bcrypt from "bcrypt";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/* -------------------------------------------------------------------------- */
/*  argv parsing                                                                */
/* -------------------------------------------------------------------------- */

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      out[key] = true;
    } else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const email = typeof args.email === "string" ? args.email.trim().toLowerCase() : "";
const name = typeof args.name === "string" ? args.name.trim() : "";
const password = typeof args.password === "string" ? args.password : "";

if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error(
    "[create-admin] Usage: node scripts/create-admin.mjs --email you@example.com [--name \"Your Name\"] [--password hunter2]",
  );
  process.exit(1);
}

/* -------------------------------------------------------------------------- */
/*  Prisma client                                                               */
/* -------------------------------------------------------------------------- */

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

/* -------------------------------------------------------------------------- */
/*  Interactive prompt helper (skipped when --password supplied)                */
/* -------------------------------------------------------------------------- */

async function prompt(question) {
  const rl = createInterface({ input, output });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

/* -------------------------------------------------------------------------- */
/*  Main                                                                        */
/* -------------------------------------------------------------------------- */

async function main() {
  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    if (existing.role === "ADMIN" && !password) {
      // Already an admin and no password reset requested. Idempotent
      // success: print the current state and exit.
      console.log(
        JSON.stringify(
          {
            ok: true,
            action: "noop",
            message: `${email} is already an ADMIN.`,
            user: {
              id: existing.id,
              email: existing.email,
              name: existing.name,
              role: existing.role,
              isSuspended: existing.isSuspended,
            },
          },
          null,
          2,
        ),
      );
      return;
    }

    // Either promote-to-admin, or reset the password. We never silently
    // overwrite a name — admins should rename through the user UI.
    const data = { role: "ADMIN" };
    if (password) {
      data.password = await bcrypt.hash(password, 12);
    }
    const updated = await prisma.user.update({
      where: { id: existing.id },
      data,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        isSuspended: true,
        createdAt: true,
      },
    });
    console.log(
      JSON.stringify(
        {
          ok: true,
          action: password ? "promote_and_reset_password" : "promote",
          message: `${email} is now an ADMIN.`,
          user: updated,
        },
        null,
        2,
      ),
    );
    return;
  }

  /* ----------------------------------------------------------------------- */
  /*  CREATE — user doesn't exist yet                                         */
  /* ----------------------------------------------------------------------- */

  // We need both a name and a password to mint a fresh account. Prompt
  // for whichever the caller didn't supply.
  let finalName = name;
  if (!finalName) {
    const answer = await prompt("[create-admin] Name (display name for navbar): ");
    finalName = answer.trim();
  }
  if (finalName.length < 2 || finalName.length > 80) {
    throw new Error("name must be 2-80 characters");
  }

  let finalPassword = password;
  if (!finalPassword) {
    const answer = await prompt(
      "[create-admin] Password (min 8 chars): ",
    );
    finalPassword = answer;
  }
  if (finalPassword.length < 8) {
    throw new Error("password must be at least 8 characters");
  }

  const hash = await bcrypt.hash(finalPassword, 12);

  const created = await prisma.user.create({
    data: {
      email,
      name: finalName,
      password: hash,
      role: "ADMIN",
    },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      isSuspended: true,
      createdAt: true,
    },
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        action: "create",
        message: `Admin account created for ${email}.`,
        user: created,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((err) => {
    console.error(
      "[create-admin] failed:",
      err instanceof Error ? err.message : err,
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

# KhaiDai

> A full-stack food-delivery platform — three role-scoped apps (customer, partner, rider) backed by an admin console, with end-to-end online payment via SSLCommerz and live order tracking on an interactive map.

[![Next.js](https://img.shields.io/badge/Next.js-14.2-black?logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-strict-blue?logo=typescript)](https://www.typescriptlang.org)
[![Prisma](https://img.shields.io/badge/Prisma-7.10-2D3748?logo=prisma)](https://www.prisma.io)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?logo=postgresql)](https://www.postgresql.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-38B2AC?logo=tailwind-css)](https://tailwindcss.com)

---

## Screenshots

<!-- Replace the placeholders below with real screenshots before
     publishing the repo. The recommended dimensions are 1280×800
     for the marketing grid and 375×812 for the mobile strip. -->

| Home                          | Restaurant page                | Checkout                       |
| ----------------------------- | ------------------------------ | ------------------------------ |
| ![](docs/screenshots/home.png) | ![](docs/screenshots/restaurant.png) | ![](docs/screenshots/checkout.png) |

| Partner dashboard             | Rider tracking                 | Admin analytics                |
| ----------------------------- | ------------------------------ | ------------------------------ |
| ![](docs/screenshots/partner.png) | ![](docs/screenshots/rider.png) | ![](docs/screenshots/admin.png) |

---

## Features

### Customer
- **Discover & search** — category strip, popular restaurants, trending dishes, restaurant detail pages
- **Cart & checkout** — multi-item cart, address selection, delivery-zone validation
- **Payment** — three online methods (bKash, Nagad, Rocket, Card) via **SSLCommerz**, plus cash on delivery
- **Live order tracking** — order status timeline + map view of the rider in transit
- **Account** — order history, favorites, address book, password reset (email OTP)

### Partner (restaurant)
- Onboarding with document upload
- Menu management (categories, items, options, add-ons, instructions)
- Order dashboard with accept / reject / ready actions
- Earnings & analytics (orders, gross, delivery, ratings, top dishes)
- Promo code management (partner-scoped)
- Live order-ticking indicator

### Rider
- Onboarding with document upload
- Available-order feed with accept / reject
- Active-delivery view with route map
- Leaderboard (today / this week / this month)
- Earnings history

### Admin
- Full management for restaurants, riders, partners, customers, orders, promos
- Analytics (orders over time, gross / net, top restaurants, top dishes)
- Pending-doc review queue
- Manual dispatch
- Refund & order-edit tooling
- Bilingual UI (English / বাংলা) with full message catalogue

### Platform
- **Role-scoped auth** — JWT cookies, four roles (CUSTOMER / PARTNER / RIDER / ADMIN), per-role dashboards
- **Bilingual** — every label lives in a namespaced message catalogue (`messages/en.json`, `messages/bn.json`)
- **Image pipeline** — uploads are processed, normalised, and served from `/uploads/*`
- **Email** — Gmail SMTP for OTP / password-reset / contact-form notifications (`lib/mailer.ts`)

---

## Tech stack

| Layer        | Technology                                              |
| ------------ | ------------------------------------------------------- |
| Frontend     | Next.js 14.2 (App Router, RSC) + React 18               |
| Styling      | Tailwind CSS 3.4 with custom `brand` / `ink` / `surface` tokens |
| Type system  | TypeScript 5.5, strict mode                             |
| Backend      | Next.js Route Handlers (`app/api/**/route.ts`)          |
| ORM          | Prisma 7.10                                             |
| Database     | PostgreSQL 16                                           |
| Auth         | JWT cookies via `jsonwebtoken` + `bcrypt` for hashing   |
| Email        | `nodemailer` over Gmail SMTP                            |
| Payments     | SSLCommerz (sandbox + production)                       |
| Maps         | Leaflet + `react-leaflet` for the live tracking view    |
| Charts       | `recharts` for the analytics dashboards                 |
| Image proc   | `@resvg/resvg-js` (dev) for rasterising SVG fixtures    |

---

## Project structure

```
khaidai/
├── app/                          # App Router (RSC by default)
│   ├── page.tsx                  # Customer home
│   ├── restaurants/              # Browse / detail
│   ├── checkout/                 # Cart → payment
│   ├── orders/                   # Order history + tracking
│   ├── partner/                  # Partner dashboard
│   ├── rider/                    # Rider dashboard
│   ├── admin/                    # Admin console
│   ├── auth/                     # Login / register / OTP
│   ├── api/                      # Route handlers (REST)
│   ├── contact/, safety/, about/, terms/, privacy/
│   └── dev/                      # Local-only routes (e.g. logo preview)
├── components/                   # Section + feature components
│   ├── home/                     # HeroSection, CategoriesStrip, ...
│   ├── checkout/
│   ├── partner/
│   ├── rider/
│   ├── admin/
│   ├── icons/                    # Inline SVG icon set
│   └── ...
├── lib/                          # Shared server utilities
│   ├── auth.ts                   # JWT + cookie helpers
│   ├── mailer.ts                 # nodemailer wrapper
│   ├── prisma.ts                 # Prisma client singleton
│   ├── ...
├── messages/                     # i18n catalogues
│   ├── en.json
│   └── bn.json
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── scripts/                      # PowerShell + Node smoke / probe scripts
├── public/                       # Static assets (icons, images, ...)
├── data/                         # Static demo data
├── .env.example                  # Copy → .env, fill in real values
├── next.config.mjs
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

---

## Getting started

### Prerequisites

- **Node.js 20+** (built and tested on Node 20 LTS)
- **PostgreSQL 16** running locally on port `5432` (or any other port — adjust `DATABASE_URL`)
- A **Gmail account with 2FA enabled** if you want to test email flows (an App Password is required)
- A **SSLCommerz sandbox account** for testing the payment gateway (sign up at <https://developer.sslcommerz.com/>)

### 1. Clone & install

```bash
git clone https://github.com/<your-org>/khaidai.git
cd khaidai
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Open `.env` and fill in real values for at least:

| Key                    | Notes                                              |
| ---------------------- | -------------------------------------------------- |
| `DATABASE_URL`         | Postgres connection string                         |
| `JWT_SECRET`           | Any 48-byte random string                          |
| `SMTP_USER` / `SMTP_PASS` | Gmail + 16-char App Password                   |
| `SSLCZ_STORE_ID` / `SSLCZ_STORE_PASSWORD` | Sandbox credentials              |
| `APP_BASE_URL`         | `http://localhost:3000` during development         |

Generate a strong JWT secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

### 3. Set up the database

```bash
# Create the DB
createdb khaidai_db

# Apply migrations
npx prisma migrate deploy

# (Optional) generate the Prisma client (also runs on `npm install`)
npx prisma generate
```

### 4. Run the dev server

```bash
npm run dev
```

Visit <http://localhost:3000>.

For a more comfortable local dev loop, use the helper script which loads `.env` automatically:

```cmd
scripts\_start_dev.cmd
```

---

## Available scripts

| Command                  | Description                                        |
| ------------------------ | -------------------------------------------------- |
| `npm run dev`            | Start the dev server on port 3000                  |
| `npm run build`          | Production build                                   |
| `npm run start`          | Run the production build                           |
| `npm run lint`           | ESLint                                             |
| `npx tsc --noEmit`       | Type-check (no JS emit)                            |
| `npx prisma migrate dev` | Generate + apply a new migration in dev            |
| `npx prisma studio`      | Open Prisma Studio (DB GUI)                        |

### Probe / e2e scripts

The `scripts/` folder contains a large suite of **Node / PowerShell** smoke, probe, and e2e scripts. They expect a running dev server (default `http://localhost:3000`) and the seeded `@khaidai.test` users (see the `seed-*.mjs` files).

Examples:

```bash
# Boot the server in one terminal
npm run dev

# In another terminal — run an end-to-end payment flow
node scripts\_m4_e2e.mjs

# A few other useful probes
node scripts\_e2e_payment_methods.mjs
node scripts\_e2e_checkout_fee.mjs
node scripts\probe-admin-analytics.mjs
```

A couple of scripts that touch the database directly:

```powershell
# Snapshot the database (writes to scripts/.db-backups/)
powershell -ExecutionPolicy Bypass -File scripts\_backup-db.ps1

# Quick row counts
powershell -ExecutionPolicy Bypass -File scripts\check-db-counts.ps1
```

---

## Localisation

UI strings live in:

- `messages/en.json` — English
- `messages/bn.json` — বাংলা (Bangla)

The active locale is read from the `khaidai_locale` cookie (set by the language switcher in the top nav). All pages reach strings via the `useT(locale)` helper, **never** hardcode UI copy.

When you add a new label, always add the key to **both** `en.json` and `bn.json`. A missing key will surface as `[messages.<key>]` in the UI — easy to grep for and fix.

---

## Security & secrets

- `.env` is **never** committed (see `.gitignore`).
- All probe and e2e scripts use seeded `@khaidai.test` users with a known password so they can run unattended in dev. **Do not** ship these users to a production database.
- Role escalation is server-enforced: every API route validates the JWT cookie + the request's `expectedRole` claim. Customer-issued requests can't impersonate admins, partners, or riders.
- The `prisma migrate deploy` workflow is the supported way to update the schema in non-dev environments.

If you fork this repo for your own deployment:

1. Rotate `JWT_SECRET` and the SMTP / SSLCommerz credentials.
2. Set `SSLCZ_IS_SANDBOX=false` for live payments.
3. Set `NEXT_PUBLIC_SUPPORT_EMAIL` to a real address.
4. Re-seed the admin user with a fresh bcrypt-hashed password.

---

## Contributing

1. Open an issue first to agree on scope.
2. Branch off `main` (`feat/<short-slug>` or `fix/<short-slug>`).
3. Run `npx tsc --noEmit` and the relevant `scripts/probe-*.mjs` / `scripts/_e2e_*.mjs` before opening a PR.
4. New UI copy must come in both `en.json` and `bn.json`.
5. New database tables / columns must come with a `prisma migrate dev` commit.

---

## License

UNLICENSED — this is a private project. All rights reserved by the project authors.

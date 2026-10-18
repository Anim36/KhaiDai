# KhaiDai — Homepage

Pixel-perfect implementation of the KhaiDai Figma design using **Next.js 14 + TypeScript + Tailwind CSS**.

## Tech stack
- Next.js 14.2 (App Router) — Server Components by default
- TypeScript (strict)
- Tailwind CSS 3.4 with custom design tokens (`brand`, `ink`, `surface`)
- `next/font/google` for **Outfit** (used for headings, buttons, and body)

## Sections (1:1 with Figma)
1. Sticky top nav — logo + location + search + cart + profile
2. Hero — dark image + 65% overlay, two-column with address pill
3. Categories — "What's on your mind?" 6 cards
4. Promo carousel — bKash + Free Delivery
5. Popular Restaurants — 4 cards (image / name / cuisine / rating / time / fee)
6. Top Trending Dishes — 4 cards (image / name / restaurant / price / Add+)
7. Footer — dark, 4-column with app downloads

## Getting started
```bash
npm install
npm run dev
```
Visit `http://localhost:3000`.

## Project layout
```
app/
  layout.tsx          # Root layout + fonts
  page.tsx            # Renders <HomePage />
  globals.css         # Tailwind layers + base reset
components/
  home/               # Section-level Server Components
    HomePage.tsx      # Composition root
    TopNav.tsx
    HeroSection.tsx
    CategoriesStrip.tsx
    PromoCarousel.tsx
    PopularRestaurants.tsx
    TopTrendingDishes.tsx
    Footer.tsx
  icons/index.tsx     # Inline SVG icon set
data/
  home.ts             # Categories / promos / restaurants / dishes
public/assets/        # Local Figma asset copies (avoids 7-day TTL)
tailwind.config.ts    # Design tokens → Tailwind theme
```

## Design tokens
| Token | Value |
|---|---|
| Brand orange | `#ff4d30` |
| Brand tint | `#fff4f2` / `#ffebe8` |
| Ink (heading) | `#111827` |
| Muted text | `#6b7280` |
| Surface / borders | `#f9fafb`, `#f3f4f6`, `#e5e7eb` |
| Rating badge | `#fef3c7` |
| Page max width | `1280px` |
| Section padding | `64px` horizontal / `40px` vertical |

## Responsive breakpoints (Tailwind defaults)
- `sm` 640px — categories drop to 3 cols
- `md` 768px — categories → 6 cols, restaurants → 2 cols
- `lg` 1024px — restaurants → 4 cols, dishes → 4 cols
- `xl` 1280px — capped by `max-w-page`

## Database

This project uses a **local PostgreSQL** instance for development. The connection string lives in `.env` (see `DATABASE_URL` — do **not** commit credentials to source).

### 1. Is the Postgres service running?

```bash
# Windows (PowerShell)
Get-Service -Name postgresql*

# macOS / Linux
sudo systemctl status postgresql
```

If it's stopped:

```bash
# Windows
Start-Service postgresql-x64-15

# macOS
brew services start postgresql

# Linux
sudo systemctl start postgresql
```

Confirm it's listening on `5432`:

```bash
# PowerShell
Get-NetTCPConnection -State Listen -LocalPort 5432

# macOS / Linux
ss -ltn | grep 5432
```

### 2. Prisma Studio (visual database browser)

Prisma ships a built-in admin UI for the local DB. Run from the project root:

```bash
npx prisma studio
```

It opens at **http://localhost:5555** — sign in is not required (it's bound to localhost only). You can browse tables, run filter queries, and edit rows. Schema changes are not made from Studio; use `prisma migrate` instead.

### 3. `psql` (direct SQL)

Connect with the same `DATABASE_URL` from `.env`:

```bash
# Interactive shell
psql "postgresql://postgres:<PASSWORD>@localhost:5432/khaidai_db"

# One-shot table list
psql "postgresql://postgres:<PASSWORD>@localhost:5432/khaidai_db" -c "\dt"

# Quick row check (note PascalCase quoted identifier — Prisma convention)
psql "postgresql://postgres:<PASSWORD>@localhost:5432/khaidai_db" -c 'SELECT * FROM "User" LIMIT 10;'

# Pretty-print with column widths (use \x when columns are wide JSON)
psql "postgresql://postgres:<PASSWORD>@localhost:5432/khaidai_db" -c '\x' -c 'SELECT id, name, email, role, "createdAt" FROM "User" ORDER BY "createdAt" DESC LIMIT 5;'
```

Replace `<PASSWORD>` with the value from `.env`. If you can't find `.env`, the superuser password is also stashed at `%USERPROFILE%/.khaidai/pg-superuser.txt` on Windows.

### 4. Migration status

Check whether the database schema matches the Prisma schema, and whether any migrations are pending:

```bash
npx prisma migrate status
```

Apply pending migrations:

```bash
npx prisma migrate dev
```

Generate the Prisma client (re-run after editing `prisma/schema.prisma`):

```bash
npx prisma generate
```

### 5. Useful one-shot queries

```sql
-- Recently registered users
SELECT id, name, email, role, "createdAt"
FROM "User"
ORDER BY "createdAt" DESC
LIMIT 10;

-- Recent orders with status
SELECT id, status, total, "paymentMethod", "placedAt"
FROM "Order"
ORDER BY "placedAt" DESC
LIMIT 10;

-- Saved payment methods per user
SELECT u.name, pm.type, pm."accountNumber", pm."isDefault"
FROM "PaymentMethod" pm
JOIN "User" u ON u.id = pm."userId"
ORDER BY u."createdAt" DESC;

-- Restaurants with their menu count
SELECT r.name, COUNT(m.id) AS menu_items
FROM "Restaurant" r
LEFT JOIN "MenuItem" m ON m."restaurantId" = r.id
GROUP BY r.id
ORDER BY menu_items DESC;
```




## Admin panel

The platform ships with an admin portal at `/admin/*` for moderation,
audit, and platform-wide management. Admins are **locked to the admin
tree only** — they cannot browse the customer, partner, or rider
dashboards. Admin actions are recorded in the audit log automatically.

### Creating your first admin account

The platform starts with **no** admin accounts — the first admin
must be created out-of-band via the CLI script, since the public
register endpoint refuses to mint ADMIN users (and the admin login
itself requires an admin).

```bash
# Create a brand-new admin (will prompt for name + password).
node scripts/create-admin.mjs --email you@example.com

# Or pass everything non-interactively:
node scripts/create-admin.mjs --email you@example.com --name "Your Name" --password hunter2-strong
```

The script is idempotent: running it again with the same email will
report that the user is already an ADMIN. If you only want to
promote an existing CUSTOMER / PARTNER / RIDER to ADMIN (without
changing their password), the same command works:

```bash
# Promote customer-smoke@khaidai.test (existing customer) to ADMIN.
node scripts/create-admin.mjs --email customer-smoke@khaidai.test
```

If you also want to reset the user's password while promoting:

```bash
node scripts/create-admin.mjs --email customer-smoke@khaidai.test --password new-strong-password
```

### Logging in

Once the account exists, open `http://localhost:3000/admin/login` and
sign in with the email + password you set above. The login form
rejects any non-ADMIN account with a banner like "This account is
registered as CUSTOMER. Use the matching login page instead."

After signing in you land on `/admin/dashboard`.

### What lives in the admin panel

| Path | Purpose |
| --- | --- |
| `/admin/dashboard` | Platform metrics — user counts by role, restaurants, orders by status, total delivered revenue, last 7 days of order volume (Recharts bar chart), and the 10 most recent orders across the platform. |
| `/admin/users` | All users, filterable by role / suspended status / free-text search. Click a row for the detail modal; "Suspend" / "Reinstate" toggles `User.isSuspended` (refused logins land in the audit log). |
| `/admin/restaurants` | Every restaurant, filterable by status / search / show-deleted toggle. "Suspend" hides the row from the customer-facing listing immediately. |
| `/admin/orders` | Every order, filterable by status / date range / search. Click a row for the full order detail (items, all three actors, totals, promo discount). |
| `/admin/audit-log` | Read-only viewer over every `AuditLog` row — filter by entityType / action / date range / free text. Click a row to expand the before / after JSON diff inline. |
| `/admin/promo-codes` | Platform-wide + partner-created promo codes, all in one table. Toggle `isActive` from the row; every change writes an audit row. |

### Manual test checklist

After creating an admin and signing in, walk through these six
checks — they're the ones we run before declaring the panel done:

1. **Sign in lands on the dashboard** — create an admin via the
   script, log in at `/admin/login`, confirm you land on
   `/admin/dashboard` and the metric tiles + chart render real
   numbers.
2. **Users, Restaurants, Orders pages show real data** — open
   each tab and confirm at least a handful of rows + the filter
   dropdowns work.
3. **Suspending a user blocks their login** — from `/admin/users`,
   click any user → "Suspend account", confirm in the row, then
   try logging in with that user's email + password at `/login`.
   Expect a 401 ("Invalid email or password" — we deliberately
   return the same message for suspended accounts to avoid leaking
   account status).
4. **Audit log captures prior moderation actions** — open
   `/admin/audit-log`, confirm you see rows for the order status
   changes, promo-code creates, and any suspensions you just
   performed. Expand a row to see the before / after JSON.
5. **Non-admin roles are blocked from `/admin/*`** — log out, log
   back in as a CUSTOMER / PARTNER / RIDER, and try to navigate to
   `/admin/dashboard` directly. The middleware redirects you to
   your own portal (or `/` for customers); the API returns 403.
6. **TypeScript compiles cleanly** — run `npx tsc --noEmit` from
   the project root; expect zero errors.

### Adding more admins

Other admins can promote / create accounts via the same script. There
is no in-app "promote to admin" button today — by design, role
escalation stays an out-of-band CLI operation so a compromised
admin can't quietly mint more admins.


## Promo carousel (homepage)

The homepage "Promo / Offers" carousel renders every active promo
code as a horizontally-scrollable row of fixed-width cards. Codes
that overflow the viewport can be reached with mouse-wheel, touch
drag, or the left/right arrow buttons that appear when there's
content off-screen.

### What's on each card

- **Image** — either the per-promo `imageUrl` (data URL or external
  https URL), or a brand-coloured gradient with a TicketIcon
  fallback when no image has been uploaded.
- **Discount pill** — top-left corner; "50% OFF" / "৳70 OFF"
  depending on the discount type.
- **Description** — generated server-side (e.g. "৳70 off (min ৳300)").
- **Full code** — `break-all` so even long codes wrap instead of
  being truncated. Every character is visible.
- **Copy Code** button — pinned to the bottom of every card so its
  position is consistent regardless of card content.

### Setting `imageUrl`

`imageUrl` is a nullable `String` on the `PromoCode` model. The
partner promo creation form (under "Carousel image (optional)")
accepts an image file (JPG/PNG/SVG, up to 5 MB) and reads it into a
data URL via `FileReader`. The admin promo-codes page currently
displays the column in the list; the in-app upload UI for admin is a
future iteration.

The API also accepts an external `https://` URL (capped at 2048
chars) so admins can paste a CDN-hosted image. Validation lives in
`app/api/partner/promo-codes/route.ts` — see the
`MAX_MENU_IMAGE_DATA_URL_CHARS` cap for the data-URL envelope.

### Files of note

- `components/home/PromoCarousel.tsx` — the redesigned component
  (horizontal scroll + arrow buttons + image rendering).
- `components/partner/dashboard/PartnerPromoCodesPage.tsx` — the
  upload UI lives in `PromoCodeFormModal` next to the existing
  fields.
- `app/api/promo-codes/active/route.ts` — feeds the carousel;
  includes `imageUrl` per row.
- `prisma/migrations/20261004090000_promo_code_image_url/migration.sql`
  — adds the column.


## Auth hardening (role enforcement)

কাজ ২ closed a security gap where the customer-facing
`/api/auth/login` endpoint would happily issue a CUSTOMER JWT for
any account whose email + password matched — including ADMIN /
PARTNER / RIDER. Now:

- **Customer `/login` form** can only sign in accounts whose role is
  `CUSTOMER`. Any other account receives a generic
  `"Invalid email or password"` 401 (no role leak).
- **Partner / Rider / Admin login forms** send an explicit
  `expectedRole` to `/api/auth/login`. The server compares it to the
  account's stored role and:
  - on mismatch → `403` with `"This account is registered as <ROLE>.
    Use the matching login page."`, which the form surfaces as a
    top-of-form banner.
  - on match → normal JWT issuance.
- **Customer `/register` endpoint** ignores any `role` field the
  client sends and always creates a `CUSTOMER`. Partner / rider
  signup live on dedicated sub-routes
  (`/api/auth/register/partner` and `/api/auth/register/rider`) so
  there's no path for a tampered request to escalate to those
  roles. The `AuthProvider.register()` helper routes to the right
  endpoint automatically based on the form's role parameter.
- **Edge middleware** now treats `/` as a CUSTOMER-only route
  (previously it was a public landing page). PARTNER / RIDER /
  ADMIN hitting `/` via direct URL or stale bookmark are bounced
  to their own dashboard. The brand-badge link on the partner /
  rider **auth** pages still points to `/` and continues to work
  because at that point the user isn't logged in yet (no role
  cookie), so the redirect doesn't fire.

### Smoke verification

`scripts/_verify_carousel_security.ps1` runs the full 26-check
end-to-end suite covering:

1. Customer login rejects ADMIN / PARTNER / RIDER (generic 401).
2. Customer login accepts a real CUSTOMER.
3. Partner / Rider / Admin login reject non-matching roles with a
   403 + role-mention message.
4. Tampered `expectedRole=CUSTOMER` + ADMIN creds still gets 403
   (the expectedRole gate wins).
5. `/api/auth/register` ignores `role=ADMIN` and forces CUSTOMER.
6. `/api/auth/register/partner` and `/api/auth/register/rider`
   create the right role.
7. PARTNER / RIDER / ADMIN cookies hitting `/` redirect to the
   matching dashboard.
8. CUSTOMER / guest can still load `/`.
9. `/api/promo-codes/active` carries the `imageUrl` field.
10. `/api/admin/promo-codes` returns `imageUrl` per row.

Run with:

```bash
powershell -ExecutionPolicy Bypass -File scripts\_verify_carousel_security.ps1
```

Expect "26 / 26 tests passed".

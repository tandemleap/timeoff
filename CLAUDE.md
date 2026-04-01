# TimeOff — PTO Tracker for LTE Employees

## Project Overview

A web app for tracking PTO for LTE (Limited Term, Part-Time) employees.
Deployed at `timeoff.tandemleap.com`.

**Tech stack:** Next.js 14 (App Router) · Supabase (Auth + PostgreSQL) · Tailwind CSS · Vercel

---

## PTO Policy Rules

- Single combined PTO bank (personal + sick + vacation — no separation)
- PTO accrues based on hours worked, not front-loaded
- **90-day waiting period** before any PTO can be used
- Accrual rate: `1 hour PTO per 30 hours worked` (always)
- Vacation tier (annual hours cap) increases with years of service, based on `hire_date`

### Vacation Tier Schedule

| Years of Service | Annual PTO Hours Cap |
|---|---|
| 0–4 | 80 |
| 5–9 | 120 |
| 10–13 | 160 |
| 14–17 | 200 |
| 18+ | 224 |

Tier is based on `hire_date`, even for employees with an opening balance.

### Accrual Segments

The timeline is split into segments at two types of boundaries:
1. **Hours-change dates** — when avg_hours_per_week changes (recorded in `hours_history`)
2. **Vacation-tier anniversary dates** — when years-of-service crosses a tier threshold

Each segment uses its own `avg_hours_per_week` and `vacationHours` cap.

---

## Opening Balance (Retroactive Import)

Employees hired before app launch are imported with a balance snapshot:
- `opening_balance_date` — the snapshot date
- `opening_balance_hours` — net PTO hours as of that date (already accounts for prior usage)
- Accrual starts forward from `opening_balance_date`
- `hire_date` is always preserved for tier (years-of-service) calculations
- Prior PTO usage is baked into the opening balance — do not double-count it

---

## Auth Flow

- **Invite-only** — no public sign-up. Admin calls Supabase `inviteUserByEmail` (service role).
- **Role stored in user metadata** — `raw_user_meta_data: { "role": "admin" }` for admins.
- **Employee role** — no metadata or `{ "role": "employee" }`.
- RLS policies check `auth.jwt() -> 'user_metadata' ->> 'role'`.

### Auth Routes

| Route | Purpose |
|---|---|
| `/login` | Email + password login |
| `/accept-invite` | Set password after receiving invite email |
| `/reset-password` | Request reset email OR set new password (dual-mode) |
| `/auth/callback` | Handles invite, recovery, and OAuth code exchange |

---

## Project Structure

```
src/
  app/
    (auth)/           # Unauthenticated pages
      login/
      accept-invite/
      reset-password/
    (app)/            # Authenticated pages (layout includes NavBar)
      layout.tsx
      dashboard/      # Employee: balance, accrual info, usage history
      use-pto/        # Employee: log PTO usage
      admin/          # Admin: team overview table
        employees/
          new/        # Create employee + send invite
          [id]/       # Edit employee, update hours, opening balance, audit trail
    auth/
      callback/       # route.ts — Supabase auth redirect handler
  lib/
    pto/
      engine.ts       # Full PTO calculation engine (TypeScript)
    actions/
      employee.ts     # All server actions (DB reads/writes)
    supabase/
      client.ts       # Browser Supabase client
      server.ts       # Server Supabase client (cookie-based)
      middleware.ts   # Session refresh middleware
  components/
    NavBar.tsx        # Server component; shows Admin link for role=admin
    SignOutButton.tsx  # Client component
  types/
    employee.ts       # Shared TypeScript types
```

---

## Database Schema (Supabase PostgreSQL)

Three tables, all with RLS enabled. Schema file: `supabase/schema.sql`.

### `employees`
- `id` uuid PK
- `user_id` uuid → `auth.users(id)`
- `name` text
- `hire_date` date
- `opening_balance_date` date (nullable)
- `opening_balance_hours` numeric (nullable)

### `hours_history`
- `employee_id` → `employees(id)`
- `effective_date` date
- `avg_hours_per_week` numeric
- First entry is applied from `hire_date` (or `opening_balance_date` for imports)

### `pto_usage`
- `employee_id` → `employees(id)`
- `usage_date` date
- `hours_used` numeric
- `note` text (optional)

### RLS Summary
- Admin (role=admin in JWT metadata): full access to all tables
- Employee: select own `employees` row, select own `hours_history`, select + insert own `pto_usage`

---

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL=https://bwxraqhsdxwzcmooikli.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...   # Supabase "publishable" key
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...            # Supabase "secret" key
```

Supabase now uses `sb_publishable_*` (replaces anon key) and `sb_secret_*` (replaces service_role key).
The env var names in `@supabase/ssr` remain the same — only the values changed format.

`.env.local` is gitignored and contains the real values.
`.env.example` contains placeholders for reference.

---

## Server Actions (`src/lib/actions/employee.ts`)

| Action | Who calls it | What it does |
|---|---|---|
| `getMyEmployee()` | Employee pages | Fetch own employee record |
| `getMyPTOUsage()` | Dashboard | Fetch own PTO usage list |
| `logPTOUsage(date, hours, note)` | use-pto | Insert PTO usage row |
| `getAllEmployeesWithPTO()` | Admin page | All employees with computed PTO |
| `getEmployeeById(id)` | Admin [id] page | Single employee with PTO + history |
| `createEmployee(data)` | Admin new page | Insert employee + first hours record + send invite |
| `updateEmployeeHours(id, date, hours)` | Admin [id] page | Insert new hours_history row |
| `updateOpeningBalance(id, date, hours)` | Admin [id] page | Update opening balance fields |

All actions use the Supabase server client (cookie-based session). Admin actions use the service role client to bypass RLS where needed.

---

## PTO Engine (`src/lib/pto/engine.ts`)

Key exports:
- `calculatePTOAccrual(startDate, endDate, avgHoursPerWeek, vacationHours)` — accrues for one segment
- `getVacationHours(yearsOfService)` — returns tier cap
- `getAccrualRate()` — returns `1/30`
- `isPTOEligible(hireDate, asOfDate)` — true if 90-day wait has passed
- `computeEmployeePTO(employee, hoursHistory, usageList, asOfDate)` — full segmented calculation
- `getPTOBalance(employee, hoursHistory, usageList, asOfDate)` — returns net balance

The engine is a TypeScript port of the original JS files (`pto_calculator.js`, `employee_pto.js`) which have 78 passing tests.

---

## Deployment

- **Vercel** — import from GitHub, set env vars, custom domain `timeoff.tandemleap.com`
- **Branch:** `claude/plan-pto-tracking-app-tuwk3` (active development branch)
- **Build command:** `npm run build` (Next.js standard)
- **Config file:** `next.config.mjs` (must be `.mjs` or `.js` — Next.js 14 does not support `.ts`)

### Supabase Auth Setup (required before first login)
1. Authentication → URL Configuration:
   - Site URL: `https://timeoff.tandemleap.com`
   - Redirect URLs: `https://timeoff.tandemleap.com/auth/callback`, `http://localhost:3000/auth/callback`
2. Authentication → Providers → Email: disable "Enable sign ups"
3. Create admin user: Authentication → Users → Invite User → after accepting, set `raw_user_meta_data` to `{"role": "admin"}`

---

## Known Issues / Watch-Outs

- `next.config.ts` is NOT supported in Next.js 14 — use `next.config.mjs`
- Supabase `setAll` cookie callback needs explicit type: `{ name: string; value: string; options?: CookieOptions }[]`
- `Array.from(set.values())` required instead of `[...set.values()]` for bundler compatibility
- `PTOResult`, `PTOSegment`, `EmployeeRecord`, etc. must be explicitly re-exported from `engine.ts`
- Admin role check uses `auth.jwt() -> 'user_metadata' ->> 'role'` (not `app_metadata`)

---

## Git

- Active branch: `claude/plan-pto-tracking-app-tuwk3`
- Push command: `git push -u origin claude/plan-pto-tracking-app-tuwk3`
- Always run `npx tsc --noEmit` before committing to catch TypeScript errors

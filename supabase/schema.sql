-- ============================================================
-- PTO Tracker — Supabase Schema
-- Run this in the Supabase SQL Editor for your project.
-- ============================================================

-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- ------------------------------------------------------------
-- EMPLOYEES
-- One row per staff member. Linked to Supabase auth.users.
-- opening_balance_* fields are null for employees hired after
-- app launch; set for imported pre-existing employees.
-- ------------------------------------------------------------
create table public.employees (
  id                    uuid primary key default uuid_generate_v4(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  name                  text not null,
  hire_date             date not null,
  opening_balance_date  date,           -- null for new hires
  opening_balance_hours numeric(8,2),   -- net PTO balance as of opening_balance_date
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique(user_id)
);

-- ------------------------------------------------------------
-- HOURS HISTORY
-- Records average weekly hours per employee over time.
-- The first entry is applied retroactively to hire_date
-- (or opening_balance_date for imported employees).
-- Updated on each anniversary or whenever schedule changes.
-- ------------------------------------------------------------
create table public.hours_history (
  id                    uuid primary key default uuid_generate_v4(),
  employee_id           uuid not null references public.employees(id) on delete cascade,
  effective_date        date not null,
  avg_hours_per_week    numeric(5,2) not null check (avg_hours_per_week >= 0),
  created_at            timestamptz not null default now(),
  unique(employee_id, effective_date)
);

-- ------------------------------------------------------------
-- PTO USAGE
-- Each row represents one PTO usage event logged by an employee
-- or recorded by the admin.
-- ------------------------------------------------------------
create table public.pto_usage (
  id           uuid primary key default uuid_generate_v4(),
  employee_id  uuid not null references public.employees(id) on delete cascade,
  usage_date   date not null,
  hours_used   numeric(6,2) not null check (hours_used > 0),
  note         text,
  created_at   timestamptz not null default now()
);

-- ------------------------------------------------------------
-- ADMIN ROLE
-- Stored in Supabase Auth user metadata, not a separate table.
-- Set via: Authentication → Users → Edit → raw_user_meta_data
--   { "role": "admin" }
-- RLS policies below read from auth.jwt() → user_metadata.
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ------------------------------------------------------------
alter table public.employees    enable row level security;
alter table public.hours_history enable row level security;
alter table public.pto_usage    enable row level security;

-- EMPLOYEES: admin sees/modifies all; employee sees only their own row
create policy "admin_all_employees" on public.employees
  for all
  using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');

create policy "employee_own_record" on public.employees
  for select
  using (auth.uid() = user_id);

-- HOURS HISTORY: admin all; employee reads their own
create policy "admin_all_hours" on public.hours_history
  for all
  using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');

create policy "employee_own_hours" on public.hours_history
  for select
  using (
    exists (
      select 1 from public.employees e
      where e.id = employee_id
        and e.user_id = auth.uid()
    )
  );

-- PTO USAGE: admin all; employee reads and inserts their own
create policy "admin_all_usage" on public.pto_usage
  for all
  using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');

create policy "employee_read_own_usage" on public.pto_usage
  for select
  using (
    exists (
      select 1 from public.employees e
      where e.id = employee_id
        and e.user_id = auth.uid()
    )
  );

create policy "employee_insert_own_usage" on public.pto_usage
  for insert
  with check (
    exists (
      select 1 from public.employees e
      where e.id = employee_id
        and e.user_id = auth.uid()
    )
  );

-- ------------------------------------------------------------
-- UPDATED_AT TRIGGER
-- ------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger employees_updated_at
  before update on public.employees
  for each row execute function public.set_updated_at();

-- Apply after the existing cleaner_work_records migration. No existing records changed.
create table if not exists public.finance_cash_entries (
 id uuid primary key default gen_random_uuid(),
 entry_date date not null,
 kind text not null check(kind in ('expense','opening_balance','capital_in','capital_out','tax_remittance','other_income')),
 category text not null,
 amount_cents bigint not null check(amount_cents > 0 and amount_cents <= 1000000000),
 reference text not null,
 notes text not null default '',
 created_by uuid not null,
 created_at timestamptz not null default now(),
 unique(kind,reference)
);
alter table public.finance_cash_entries enable row level security;
revoke all on public.finance_cash_entries from anon, authenticated;
grant select,insert on public.finance_cash_entries to service_role;

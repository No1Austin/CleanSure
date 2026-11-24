-- Run ONCE in Supabase SQL Editor before using the new accounting screens.
-- Does not change existing bookings or cleaner profiles. No fake revenue is generated.
create table if not exists public.cleaner_work_records (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete restrict,
  cleaner_id uuid not null references public.cleaner_profiles(id) on delete restrict,
  work_date date not null,
  work_status text not null default 'scheduled' check (work_status in ('scheduled','in_progress','completed','cancelled')),
  scheduled_hours numeric(8,2) not null default 0 check (scheduled_hours >= 0 and scheduled_hours <= 168),
  approved_hours numeric(8,2) not null default 0 check (approved_hours >= 0 and approved_hours <= 168),
  compensation_mode text not null check (compensation_mode in ('hourly','percentage')),
  hourly_rate_cents integer check (hourly_rate_cents >= 0),
  percentage_rate numeric(6,3) check (percentage_rate >= 0 and percentage_rate <= 100),
  -- Customer payments are entered only after actual receipt is verified by an admin.
  customer_subtotal_cents integer not null default 0 check (customer_subtotal_cents >= 0),
  hst_collected_cents integer not null default 0 check (hst_collected_cents >= 0),
  customer_payment_status text not null default 'unpaid' check (customer_payment_status in ('unpaid','paid','refunded')),
  customer_paid_at timestamptz,
  refund_cents integer not null default 0 check (refund_cents >= 0),
  cleaner_payout_status text not null default 'unpaid' check (cleaner_payout_status in ('unpaid','paid')),
  cleaner_paid_at timestamptz,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (booking_id),
  check ((compensation_mode='hourly' and hourly_rate_cents is not null and percentage_rate is null)
      or (compensation_mode='percentage' and percentage_rate is not null and hourly_rate_cents is null)),
  check (customer_payment_status <> 'paid' or customer_paid_at is not null),
  check (cleaner_payout_status <> 'paid' or cleaner_paid_at is not null),
  check (refund_cents <= customer_subtotal_cents + hst_collected_cents)
);
create index if not exists cleaner_work_records_cleaner_date_idx on public.cleaner_work_records(cleaner_id,work_date);
create index if not exists cleaner_work_records_work_date_idx on public.cleaner_work_records(work_date);
create index if not exists cleaner_work_records_booking_idx on public.cleaner_work_records(booking_id);
alter table public.cleaner_work_records enable row level security;
-- No public/anon policies. All reads/writes go through the authenticated Express API
-- with a server-only Supabase secret and explicit admin/cleaner authorization.
revoke all on public.cleaner_work_records from anon, authenticated;

-- Run once in your CleanSure Supabase project's SQL Editor.
-- Prices are CAD; the server independently computes the estimate.
alter table public.bookings
  add column if not exists hourly_rate numeric(10,2),
  add column if not exists estimated_subtotal numeric(10,2),
  add column if not exists estimated_hst numeric(10,2),
  add column if not exists estimated_total numeric(10,2),
  add column if not exists estimate_accepted_at timestamptz;

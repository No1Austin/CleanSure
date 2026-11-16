-- CleanSure schema aligned with server/src/routes/bookingRoutes.js.
-- Run in the Supabase SQL editor of your dedicated CleanSure project.
create extension if not exists pgcrypto;
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  booking_code text unique not null default ('CS-' || upper(substr(replace(gen_random_uuid()::text, '-', ''),1,12))),
  service text not null check (service in ('residential','deep','move','commercial','other')),
  property text not null,
  address text not null,
  bedrooms text not null,
  bathrooms text not null,
  service_date date not null,
  service_time time not null,
  hours integer not null check (hours between 1 and 24),
  cleaners integer not null check (cleaners between 1 and 20),
  pets text not null check (pets in ('yes','no')),
  supplies text not null check (supplies in ('customer','company')),
  notes text,
  customer_name text not null,
  customer_email text not null,
  customer_phone text not null,
  status text not null default 'pending' check (status in ('pending','confirmed','assigned','completed','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.bookings enable row level security;
create index if not exists bookings_status_idx on public.bookings(status);
create index if not exists bookings_service_date_idx on public.bookings(service_date);
-- No public policies. Only trusted backend secret/service-role access should write.

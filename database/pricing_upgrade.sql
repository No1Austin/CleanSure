begin;
alter table public.bookings add column if not exists service_city text;
alter table public.bookings add column if not exists customer_nickname text;
alter table public.bookings add column if not exists last_cleaned text check (last_cleaned in ('within_week','over_week'));
alter table public.bookings add column if not exists cleaner_hourly_rate numeric(8,2) check (cleaner_hourly_rate between 21 and 23);
commit;

-- Apply after existing CRM and pricing migrations. Test in staging first.
begin;
alter table bookings add column if not exists stripe_session text unique, add column if not exists stripe_paid boolean not null default false, add column if not exists monitor_hash text unique, add column if not exists assigned_at timestamptz, add column if not exists customer_started timestamptz, add column if not exists cleaner_started timestamptz, add column if not exists customer_completed timestamptz, add column if not exists cleaner_completed timestamptz, add column if not exists cleaner_rating integer check(cleaner_rating between 1 and 5), add column if not exists customer_rating integer check(customer_rating between 1 and 5), add column if not exists company_rating integer check(company_rating between 1 and 5);
create or replace function cs_guard_assignment() returns trigger language plpgsql as $$ begin
 if new.crm_assigned_cleaner_id is distinct from old.crm_assigned_cleaner_id then
 if new.crm_assigned_cleaner_id is not null and (not new.stripe_paid or new.cleaners<>1 or old.customer_started is not null or old.cleaner_started is not null) then raise exception 'Assignment not permitted'; end if;
 new.monitor_hash=null; new.assigned_at=now(); end if;
 return new; end $$;
drop trigger if exists cs_assignment on bookings;
create trigger cs_assignment before update on bookings for each row execute function cs_guard_assignment();
create or replace function cs_progress(p_id uuid,p_actor text,p_key text,p_action text,p_rating integer default null,p_company integer default null) returns boolean language plpgsql set search_path=public as $$ declare b bookings%rowtype; begin
 select * into b from bookings where id=p_id for update;
 if not found or not b.stripe_paid or b.crm_assigned_cleaner_id is null or b.status not in ('assigned','in_progress','completed') then return false; end if;
 if p_actor='customer' then if b.monitor_hash is distinct from p_key then return false; end if;
 elsif p_actor='cleaner' then if b.crm_assigned_cleaner_id::text is distinct from p_key then return false; end if; else return false; end if;
 if p_action='start' and b.status<>'completed' then
 update bookings set status='in_progress',customer_started=case when p_actor='customer' then coalesce(customer_started,now()) else customer_started end,cleaner_started=case when p_actor='cleaner' then coalesce(cleaner_started,now()) else cleaner_started end where id=p_id;
 elsif p_action='complete' and b.status='in_progress' then
 if (p_actor='customer' and b.customer_started is null) or (p_actor='cleaner' and b.cleaner_started is null) then return false; end if;
 update bookings set customer_completed=case when p_actor='customer' then coalesce(customer_completed,now()) else customer_completed end,cleaner_completed=case when p_actor='cleaner' then coalesce(cleaner_completed,now()) else cleaner_completed end where id=p_id;
 update bookings set status='completed' where id=p_id and customer_completed is not null and cleaner_completed is not null;
 elsif p_action='rate' and b.status='completed' and p_rating between 1 and 5 then
 if p_actor='customer' and b.cleaner_rating is null and p_company between 1 and 5 then update bookings set cleaner_rating=p_rating,company_rating=p_company where id=p_id;
 elsif p_actor='cleaner' and b.customer_rating is null then update bookings set customer_rating=p_rating where id=p_id; else return false; end if;
 else return false; end if; return true; end $$;
revoke all on function cs_progress(uuid,text,text,text,integer,integer) from public,anon,authenticated;
grant execute on function cs_progress(uuid,text,text,text,integer,integer) to service_role;
commit;

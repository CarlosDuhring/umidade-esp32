create extension if not exists pgcrypto;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  whatsapp_phone text not null default '',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
drop policy if exists "users manage own profile" on public.profiles;
create policy "users manage own profile" on public.profiles for all to authenticated
using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.plants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  species text not null check (char_length(species) between 1 and 60),
  location text not null check (char_length(location) between 1 and 80),
  threshold_percent integer not null default 35 check (threshold_percent between 1 and 99),
  adc_dry integer not null default 2500 check (adc_dry between 0 and 4095),
  adc_wet integer not null default 1250 check (adc_wet between 0 and 4095),
  sensor_id uuid,
  alert_repeat_hours integer not null default 12 check (alert_repeat_hours between 1 and 168),
  last_low_alert_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.sensors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plant_id uuid unique references public.plants(id) on delete set null,
  device_key_hash text not null unique,
  name text not null default 'Sensor ESP32',
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.plants drop constraint if exists plants_sensor_id_fkey;
alter table public.plants add constraint plants_sensor_id_fkey foreign key (sensor_id) references public.sensors(id) on delete set null;

create table if not exists public.readings (
  id bigint generated always as identity primary key,
  sensor_id uuid not null references public.sensors(id) on delete cascade,
  moisture_percent numeric(5,2) not null check (moisture_percent between 0 and 100),
  adc integer check (adc between 0 and 4095),
  recorded_at timestamptz not null default now()
);

create table if not exists public.prototype_readings (
  id bigint generated always as identity primary key,
  moisture_percent integer not null check (moisture_percent between 0 and 100),
  adc integer not null check (adc between 0 and 4095),
  device text not null default 'esp32-prototipo',
  rssi integer,
  recorded_at timestamptz not null default now()
);

alter table public.prototype_readings enable row level security;
drop policy if exists "public can view prototype demo readings" on public.prototype_readings;
create policy "public can view prototype demo readings" on public.prototype_readings
  for select to anon, authenticated using (true);
revoke all on public.prototype_readings from anon, authenticated;
grant select on public.prototype_readings to anon, authenticated;
create index if not exists prototype_readings_recorded_idx on public.prototype_readings(recorded_at desc);

create index if not exists plants_user_created_idx on public.plants(user_id, created_at desc);
create index if not exists readings_sensor_time_idx on public.readings(sensor_id, recorded_at desc);
create index if not exists sensors_user_idx on public.sensors(user_id);
create unique index if not exists plants_sensor_unique_idx on public.plants(sensor_id) where sensor_id is not null;

create or replace function public.check_plant_sensor_owner()
returns trigger
language plpgsql
set search_path = public
as $$
declare linked_user uuid;
begin
  if new.sensor_id is not null then
    select user_id into linked_user from public.sensors where id = new.sensor_id;
    if linked_user is distinct from new.user_id then
      raise exception 'sensor must belong to the same user as the plant';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists plants_sensor_owner_guard on public.plants;
create trigger plants_sensor_owner_guard before insert or update of user_id, sensor_id on public.plants
for each row execute function public.check_plant_sensor_owner();

create or replace function public.check_sensor_plant_owner()
returns trigger
language plpgsql
set search_path = public
as $$
declare linked_user uuid;
begin
  if new.plant_id is not null then
    select user_id into linked_user from public.plants where id = new.plant_id;
    if linked_user is distinct from new.user_id then
      raise exception 'plant must belong to the same user as the sensor';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists sensors_plant_owner_guard on public.sensors;
create trigger sensors_plant_owner_guard before insert or update of user_id, plant_id on public.sensors
for each row execute function public.check_sensor_plant_owner();

alter table public.plants enable row level security;
alter table public.sensors enable row level security;
alter table public.readings enable row level security;

create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  whatsapp_phone text not null check (whatsapp_phone ~ '^\+[1-9][0-9]{7,14}$'),
  whatsapp_enabled boolean not null default false,
  email_enabled boolean not null default false,
  low_moisture_enabled boolean not null default true,
  normal_again_enabled boolean not null default true,
  sensor_offline_enabled boolean not null default true,
  alert_repeat_hours integer not null default 12 check (alert_repeat_hours between 1 and 168),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles(user_id, full_name, whatsapp_phone)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''), coalesce(new.raw_user_meta_data->>'whatsapp_phone', ''))
  on conflict (user_id) do update set full_name = excluded.full_name, whatsapp_phone = excluded.whatsapp_phone;
  insert into public.notification_preferences(user_id, whatsapp_phone)
  values (new.id, coalesce(new.raw_user_meta_data->>'whatsapp_phone', ''))
  on conflict (user_id) do update set whatsapp_phone = excluded.whatsapp_phone;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_plantspace on auth.users;
create trigger on_auth_user_created_plantspace after insert on auth.users
for each row execute function public.create_profile_for_new_user();

create table if not exists public.alerts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  plant_id uuid not null references public.plants(id) on delete cascade,
  type text not null check (type in ('low_moisture', 'normal_again', 'sensor_offline')),
  moisture_percent numeric(5,2) check (moisture_percent between 0 and 100),
  message text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists alerts_user_created_idx on public.alerts(user_id, created_at desc);

alter table public.notification_preferences enable row level security;
alter table public.alerts enable row level security;
drop policy if exists "users manage own notification preferences" on public.notification_preferences;
create policy "users manage own notification preferences" on public.notification_preferences for all to authenticated
using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "users manage own alerts" on public.alerts;
create policy "users manage own alerts" on public.alerts for all to authenticated
using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "users manage own plants" on public.plants;
create policy "users manage own plants" on public.plants for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "users manage own sensors" on public.sensors;
drop policy if exists "users read own sensors" on public.sensors;
create policy "users read own sensors" on public.sensors for select to authenticated using (auth.uid() = user_id);
revoke all on public.sensors from anon, authenticated;
grant select (id, user_id, plant_id, name, last_seen_at, created_at) on public.sensors to authenticated;

drop policy if exists "users read own sensor readings" on public.readings;
create policy "users read own sensor readings" on public.readings for select to authenticated
using (exists (select 1 from public.sensors s where s.id = sensor_id and s.user_id = auth.uid()));

revoke all on public.readings from anon, authenticated;
grant select on public.readings to authenticated;
grant usage, select on sequence public.readings_id_seq to authenticated;

create or replace function public.cleanup_old_readings()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare deleted_count bigint;
begin
  delete from public.readings where recorded_at < now() - interval '30 days';
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.cleanup_old_readings() from public, anon, authenticated;

create index if not exists readings_recorded_at_idx on public.readings(recorded_at);

comment on table public.plants is 'PlantSpace pots; rows are isolated per authenticated user by RLS.';
comment on table public.readings is 'Sensor history, retained for 30 days by cleanup_old_readings.';

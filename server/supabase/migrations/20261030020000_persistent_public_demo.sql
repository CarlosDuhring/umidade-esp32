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
  delete from public.prototype_readings where recorded_at < now() - interval '30 days';
  return deleted_count;
end;
$$;
revoke all on function public.cleanup_old_readings() from public, anon, authenticated;

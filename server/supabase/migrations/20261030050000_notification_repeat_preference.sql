alter table public.notification_preferences
  add column if not exists alert_repeat_hours integer not null default 12
  check (alert_repeat_hours between 1 and 168);

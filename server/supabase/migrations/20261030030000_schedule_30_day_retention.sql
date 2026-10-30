create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'plantspace-delete-readings-older-than-30-days',
  '15 3 * * *',
  'select public.cleanup_old_readings();'
)
where not exists (
  select 1 from cron.job where jobname = 'plantspace-delete-readings-older-than-30-days'
);

create extension if not exists pg_net;
create extension if not exists pg_cron;

select cron.unschedule('meta-sync-every-15-min')
where exists (
  select 1
  from cron.job
  where jobname = 'meta-sync-every-15-min'
);

select
  cron.schedule(
    'meta-sync-every-15-min',
    '*/15 * * * *',
    $$
    select
      net.http_get(
        url := 'https://dashboard.trafegoacademy.online/api/cron/meta-sync',
        headers := jsonb_build_object(
          'Authorization',
          'Bearer COLE_SEU_CRON_SECRET_AQUI'
        )
      );
    $$
  );

-- Run once in the Supabase SQL editor.
--
-- Schedules the NTA Engine (the `nta-compute` edge function, currently
-- triggered manually from admin/compute-nta.html's "Run Engine" button) to
-- run automatically every day at 5:30pm UTC+8 (Malaysia/Singapore time).
-- pg_cron on Supabase always schedules in UTC, so that's 09:30 UTC.
--
-- Auth: nta-compute's own code (supabase/functions/nta-compute/index.ts)
-- has no admin/JWT check of its own — it builds its own privileged client
-- from its SUPABASE_SERVICE_ROLE_KEY env var regardless of who calls it.
-- The only gate is the Supabase platform's default "verify_jwt" check on
-- the function endpoint itself, which just requires the Authorization
-- header to carry *some* validly-signed project JWT — the service_role
-- key satisfies that either way, so it's used below as the caller.
--
-- The service_role key is stored in Supabase Vault rather than hardcoded
-- into the cron job body, since cron.job rows (including the SQL command
-- text) are visible to anyone who can query cron.job.

-- 0. Enable the extensions this migration needs. If this errors with a
--    permissions message (rather than succeeding or saying it already
--    exists), enable pg_cron and pg_net from the Supabase dashboard
--    instead: Database -> Extensions -> search "pg_cron" / "pg_net" ->
--    Enable — then re-run the rest of this file.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- 1. Store the service_role key in Vault (run once — replace the
--    placeholder with the real key from Project Settings -> API ->
--    service_role secret). Re-running this with the same name updates it.
select vault.create_secret(
  'REPLACE_WITH_YOUR_SERVICE_ROLE_KEY',
  'nta_compute_service_role_key',
  'service_role key used to call nta-compute from the daily cron job'
);

-- 2. Unschedule any previous version of this job before recreating it, so
--    reruns of this script don't stack duplicate schedules.
select cron.unschedule('nta-engine-daily')
where exists (select 1 from cron.job where jobname = 'nta-engine-daily');

-- 3. Schedule the daily call.
select cron.schedule(
  'nta-engine-daily',
  '30 9 * * *',  -- 09:30 UTC = 17:30 (5:30pm) UTC+8, every day
  $$
  select net.http_post(
    url := 'https://wvaibdjkjnnesefantjc.supabase.co/functions/v1/nta-compute',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'nta_compute_service_role_key'
      ),
      'apikey', (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'nta_compute_service_role_key'
      )
    ),
    body := '{}'::jsonb
  );
  $$
);

-- To check it's registered:
--   select * from cron.job where jobname = 'nta-engine-daily';
-- To see run history / catch failures:
--   select * from cron.job_run_details
--   where jobid = (select jobid from cron.job where jobname = 'nta-engine-daily')
--   order by start_time desc limit 20;
-- To stop it:
--   select cron.unschedule('nta-engine-daily');

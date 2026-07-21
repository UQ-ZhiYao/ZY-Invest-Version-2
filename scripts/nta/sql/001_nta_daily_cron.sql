-- Run once in the Supabase SQL editor.
--
-- Schedules the NTA Engine (the `nta-compute` edge function, currently
-- triggered manually from admin/compute-nta.html's "Run Engine" button) to
-- run automatically every day at 5:30pm UTC+8 (Malaysia/Singapore time).
-- pg_cron on Supabase always schedules in UTC, so that's 09:30 UTC.
--
-- Requires the pg_cron and pg_net extensions. Enable them first via
-- Database -> Extensions in the Supabase dashboard, or:
--   create extension if not exists pg_cron;
--   create extension if not exists pg_net;
--
-- IMPORTANT — auth: nta-compute's sibling function (generate-statement)
-- requires a real logged-in admin's session JWT and checks
-- profiles.role = 'admin'; a cron job has no logged-in user, so this calls
-- the function with the service_role key instead. If nta-compute enforces
-- the same admin-user check as generate-statement, it will reject a
-- service_role-only call — that function's own code needs a small
-- exception added (e.g. "if the Authorization header IS the service_role
-- key, treat the caller as trusted and skip the profiles.role lookup").
-- That edit has to happen in nta-compute itself, which isn't tracked in
-- this repo (it's deployed separately) — share its source to get that
-- patch written alongside this migration.
--
-- The service_role key is stored in Supabase Vault rather than hardcoded
-- into the cron job body, since cron.job rows (including the SQL command
-- text) are visible to anyone who can query cron.job.

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

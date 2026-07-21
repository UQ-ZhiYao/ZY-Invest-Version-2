-- Run once in the Supabase SQL editor.
--
-- nta_holdings was a per-instrument check table the NTA Engine wrote
-- alongside nta_daily on every run (see supabase/functions/nta-compute/
-- index.ts). Now that the engine's output has been verified against it,
-- the engine no longer writes to it — drop the table itself too.

drop table if exists public.nta_holdings;

create extension if not exists pg_cron;

create function private.purge_expired_ai_recommendation_data()
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.ai_workout_proposal_events where expires_at <= now();
  delete from public.ai_workout_proposals where expires_at <= now();
  delete from public.ai_reduced_generation_confirmations where expires_at <= now() or consumed_at is not null;
end;
$$;

revoke all on function private.purge_expired_ai_recommendation_data() from public, anon, authenticated;

select cron.unschedule(jobid)
from cron.job
where jobname = 'purge-expired-ai-recommendation-data';

select cron.schedule(
  'purge-expired-ai-recommendation-data',
  '17 3 * * *',
  'select private.purge_expired_ai_recommendation_data()'
);

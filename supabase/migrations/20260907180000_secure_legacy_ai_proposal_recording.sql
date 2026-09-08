-- Keep the original RPC signature safe for clients that have not yet reloaded
-- the phase-3 re-roll overload. The private function performs owner-scoped
-- inserts under controlled privileges; the public wrapper remains invoker-safe.
create or replace function public.record_ai_workout_proposal(p_exercise_ids uuid[])
returns table (proposal_id uuid, lineage_id uuid)
language sql security invoker set search_path = '' as $$
  select * from private.record_ai_workout_proposal_for_current_user(p_exercise_ids);
$$;

revoke all on function public.record_ai_workout_proposal(uuid[]) from public, anon;
grant execute on function public.record_ai_workout_proposal(uuid[]) to authenticated;

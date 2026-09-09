-- A re-roll remains part of its original proposal lineage. The Phase 3 RPC deliberately
-- reuses the lineage UUID, so it cannot be unique per raw proposal row.
alter table public.ai_workout_proposals
  drop constraint ai_workout_proposals_lineage_id_key;

create index ai_workout_proposals_lineage_id_idx
  on public.ai_workout_proposals (lineage_id);

create or replace function private.record_ai_workout_proposal_for_current_user(
  p_exercise_ids uuid[],
  p_rerolled_from_proposal_id uuid
)
returns table (proposal_id uuid, lineage_id uuid)
language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_proposal_id uuid;
  v_lineage_id uuid;
begin
  if v_user_id is null then raise exception using errcode = 'AR004', message = 'unauthenticated'; end if;
  if p_exercise_ids is null or cardinality(p_exercise_ids) not between 3 and 7
    or cardinality(p_exercise_ids) <> (select count(distinct id) from unnest(p_exercise_ids) as id)
    or exists (select 1 from unnest(p_exercise_ids) as id where not exists (select 1 from public.exercises where exercises.id = id)) then
    raise exception using errcode = 'AR003', message = 'validation_failed';
  end if;
  if p_rerolled_from_proposal_id is not null then
    select proposal.lineage_id into v_lineage_id
    from public.ai_workout_proposals proposal
    where proposal.id = p_rerolled_from_proposal_id and proposal.user_id = v_user_id and proposal.expires_at > now();
    if v_lineage_id is null then raise exception using errcode = 'AR002', message = 'proposal_not_available'; end if;
  else
    v_lineage_id := gen_random_uuid();
  end if;
  insert into public.ai_workout_proposals (user_id, lineage_id, rerolled_from_proposal_id)
  values (v_user_id, v_lineage_id, p_rerolled_from_proposal_id)
  returning id into v_proposal_id;
  insert into public.ai_workout_proposal_exercises (proposal_id, exercise_id, position)
  select v_proposal_id, id, ordinality - 1 from unnest(p_exercise_ids) with ordinality as item(id, ordinality);
  if p_rerolled_from_proposal_id is not null then
    insert into public.ai_workout_proposal_events (proposal_id, user_id, event_type)
    values (p_rerolled_from_proposal_id, v_user_id, 'reroll');
  end if;
  return query select v_proposal_id, v_lineage_id;
end;
$$;

create or replace function public.record_ai_workout_proposal(
  p_exercise_ids uuid[],
  p_rerolled_from_proposal_id uuid default null
)
returns table (proposal_id uuid, lineage_id uuid)
language sql security invoker set search_path = '' as $$
  select * from private.record_ai_workout_proposal_for_current_user(p_exercise_ids, p_rerolled_from_proposal_id);
$$;

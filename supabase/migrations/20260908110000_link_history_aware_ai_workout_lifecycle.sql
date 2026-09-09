alter table public.workouts
  add constraint workouts_id_user_id_key unique (id, user_id);

create table public.ai_workout_completion_events (
  workout_id uuid primary key,
  user_id uuid not null,
  proposal_lineage_id uuid not null,
  completed_at timestamp with time zone not null,
  expires_at timestamp with time zone not null default (transaction_timestamp() + interval '90 days'),
  constraint ai_workout_completion_events_workout_owner_fkey foreign key (workout_id, user_id)
    references public.workouts (id, user_id) on update restrict on delete cascade,
  constraint ai_workout_completion_events_user_id_fkey foreign key (user_id)
    references auth.users (id) on update restrict on delete cascade,
  constraint ai_workout_completion_events_expiry_check check (expires_at <= completed_at + interval '90 days')
);

alter table public.ai_workout_proposal_events
  drop constraint ai_workout_proposal_events_workout_id_fkey;

create index ai_workout_completion_events_expiry_idx on public.ai_workout_completion_events (expires_at);

alter table public.ai_workout_completion_events enable row level security;
revoke all on table public.ai_workout_completion_events from anon, authenticated;
grant all on table public.ai_workout_completion_events to service_role;

create function private.link_history_aware_ai_save_for_current_user(
  p_proposal_id uuid,
  p_workout_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_lineage_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode = 'AW004', message = 'unauthenticated';
  end if;

  select proposal.lineage_id
  into v_lineage_id
  from public.ai_workout_proposals proposal
  where proposal.id = p_proposal_id
    and proposal.user_id = v_user_id
    and proposal.expires_at > transaction_timestamp()
  for update;

  if v_lineage_id is null then
    raise exception using errcode = 'AW005', message = 'proposal_not_available';
  end if;

  if not exists (
    select 1
    from public.workouts workout
    where workout.id = p_workout_id
      and workout.user_id = v_user_id
      and workout.status = 'planned'
      and workout.origin = 'ai'
      and workout.ai_proposal_lineage_id is null
  ) then
    raise exception using errcode = 'AW005', message = 'proposal_not_available';
  end if;

  update public.workouts
  set ai_proposal_lineage_id = v_lineage_id
  where id = p_workout_id
    and user_id = v_user_id;

  insert into public.ai_workout_proposal_events (proposal_id, user_id, event_type, exercise_id)
  select p_proposal_id, v_user_id, 'retention', proposed.exercise_id
  from public.ai_workout_proposal_exercises proposed
  join public.workout_exercises saved
    on saved.workout_id = p_workout_id
    and saved.exercise_id = proposed.exercise_id
  where proposed.proposal_id = p_proposal_id
  order by proposed.position;

  insert into public.ai_workout_proposal_events (proposal_id, user_id, event_type, workout_id)
  values (p_proposal_id, v_user_id, 'save', p_workout_id);
end;
$$;

create function public.save_history_aware_ai_planned_workout(
  p_exercises jsonb,
  p_replace_existing boolean,
  p_proposal_id uuid,
  p_expected_workout_id uuid default null,
  p_expected_revision integer default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_workout_id uuid;
begin
  if p_proposal_id is null then
    raise exception using errcode = 'AW003', message = 'validation_failed';
  end if;

  v_workout_id := public.save_ai_planned_workout(
    p_exercises,
    p_replace_existing,
    p_expected_workout_id,
    p_expected_revision
  );

  perform private.link_history_aware_ai_save_for_current_user(p_proposal_id, v_workout_id);
  return v_workout_id;
end;
$$;

create function private.record_ai_workout_completion_for_current_user(
  p_workout_id uuid,
  p_completed_at timestamp with time zone
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception using errcode = 'PW003', message = 'unauthenticated';
  end if;

  insert into public.ai_workout_completion_events (
    workout_id,
    user_id,
    proposal_lineage_id,
    completed_at
  )
  select workout.id, workout.user_id, workout.ai_proposal_lineage_id, p_completed_at
  from public.workouts workout
  where workout.id = p_workout_id
    and workout.user_id = v_user_id
    and workout.status = 'completed'
    and workout.completed_at = p_completed_at
    and workout.ai_proposal_lineage_id is not null
  on conflict (workout_id) do nothing;
end;
$$;

create or replace function public.complete_planned_workout(
  p_expected_workout_id uuid,
  p_expected_revision integer
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_current_workout_id uuid;
  v_current_revision integer;
  v_completed_at timestamp with time zone;
begin
  if v_user_id is null then
    raise exception using errcode = 'PW003', message = 'unauthenticated';
  end if;

  if p_expected_workout_id is null or p_expected_revision is null or p_expected_revision < 1 then
    raise exception using errcode = 'PW002', message = 'validation_failed';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('perfect-training-planner:planned-workout:' || v_user_id::text, 0)
  );

  select workout.id, workout.revision
  into v_current_workout_id, v_current_revision
  from public.workouts workout
  where workout.user_id = v_user_id
    and workout.status = 'planned'
  for update;

  if v_current_workout_id is null
    or v_current_workout_id <> p_expected_workout_id
    or v_current_revision <> p_expected_revision then
    raise exception using errcode = 'PW001', message = 'stale_plan';
  end if;

  update public.workouts
  set status = 'completed', completed_at = transaction_timestamp()
  where id = v_current_workout_id
  returning completed_at into v_completed_at;

  perform private.record_ai_workout_completion_for_current_user(v_current_workout_id, v_completed_at);
  return v_current_workout_id;
end;
$$;

create or replace function private.purge_expired_ai_recommendation_data()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.ai_workout_completion_events where expires_at <= transaction_timestamp();
  delete from public.ai_workout_proposal_events where expires_at <= transaction_timestamp();
  delete from public.ai_workout_proposals where expires_at <= transaction_timestamp();
  delete from public.ai_reduced_generation_confirmations
  where expires_at <= transaction_timestamp() or consumed_at is not null;
end;
$$;

revoke all on function private.link_history_aware_ai_save_for_current_user(uuid, uuid) from public, anon;
revoke all on function private.record_ai_workout_completion_for_current_user(uuid, timestamp with time zone)
  from public, anon;
revoke all on function public.save_history_aware_ai_planned_workout(jsonb, boolean, uuid, uuid, integer)
  from public, anon;

grant execute on function private.link_history_aware_ai_save_for_current_user(uuid, uuid) to authenticated;
grant execute on function private.record_ai_workout_completion_for_current_user(uuid, timestamp with time zone)
  to authenticated;
grant execute on function public.save_history_aware_ai_planned_workout(jsonb, boolean, uuid, uuid, integer)
  to authenticated;

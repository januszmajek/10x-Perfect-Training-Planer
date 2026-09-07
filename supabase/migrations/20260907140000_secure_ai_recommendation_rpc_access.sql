create function private.get_exercise_completion_profile_for_current_user()
returns table (exercise_id uuid, completed_count bigint, last_completed_at timestamp with time zone, in_last_completed_workout boolean)
language sql stable security definer set search_path = '' as $$
  with completed_workouts as (
    select workout.id, workout.completed_at from public.workouts workout
    where workout.user_id = auth.uid() and workout.status = 'completed'
  ), latest_workout as (
    select id from completed_workouts order by completed_at desc, id desc limit 1
  )
  select workout_exercise.exercise_id, count(*)::bigint, max(completed_workouts.completed_at),
    bool_or(completed_workouts.id = (select id from latest_workout))
  from completed_workouts
  join public.workout_exercises workout_exercise on workout_exercise.workout_id = completed_workouts.id
  group by workout_exercise.exercise_id;
$$;

create or replace function public.get_exercise_completion_profile()
returns table (exercise_id uuid, completed_count bigint, last_completed_at timestamp with time zone, in_last_completed_workout boolean)
language sql stable security invoker set search_path = '' as $$
  select * from private.get_exercise_completion_profile_for_current_user();
$$;

create function private.set_ai_exercise_preference_for_current_user(p_exercise_id uuid, p_preference public.ai_exercise_preference default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception using errcode = 'AR004', message = 'unauthenticated'; end if;
  if p_exercise_id is null or not exists (select 1 from public.exercises where id = p_exercise_id) then
    raise exception using errcode = 'AR003', message = 'validation_failed';
  end if;
  if p_preference is null then
    delete from public.ai_exercise_preferences where user_id = v_user_id and exercise_id = p_exercise_id;
  else
    insert into public.ai_exercise_preferences (user_id, exercise_id, preference) values (v_user_id, p_exercise_id, p_preference)
    on conflict (user_id, exercise_id) do update set preference = excluded.preference;
  end if;
end;
$$;
create or replace function public.set_ai_exercise_preference(p_exercise_id uuid, p_preference public.ai_exercise_preference default null)
returns void language sql security invoker set search_path = '' as $$
  select private.set_ai_exercise_preference_for_current_user(p_exercise_id, p_preference);
$$;

create function private.get_ai_exercise_preferences_for_current_user()
returns table (exercise_id uuid, preference public.ai_exercise_preference)
language sql stable security definer set search_path = '' as $$
  select item.exercise_id, item.preference from public.ai_exercise_preferences item
  where item.user_id = auth.uid() order by item.exercise_id;
$$;
create or replace function public.get_ai_exercise_preferences()
returns table (exercise_id uuid, preference public.ai_exercise_preference)
language sql stable security invoker set search_path = '' as $$
  select * from private.get_ai_exercise_preferences_for_current_user();
$$;

create function private.record_ai_workout_proposal_for_current_user(p_exercise_ids uuid[])
returns table (proposal_id uuid, lineage_id uuid)
language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid := auth.uid(); v_proposal_id uuid; v_lineage_id uuid;
begin
  if v_user_id is null then raise exception using errcode = 'AR004', message = 'unauthenticated'; end if;
  if p_exercise_ids is null or cardinality(p_exercise_ids) not between 3 and 7
    or cardinality(p_exercise_ids) <> (select count(distinct id) from unnest(p_exercise_ids) as id)
    or exists (select 1 from unnest(p_exercise_ids) as id where not exists (select 1 from public.exercises where exercises.id = id)) then
    raise exception using errcode = 'AR003', message = 'validation_failed';
  end if;
  insert into public.ai_workout_proposals (user_id) values (v_user_id) returning id, lineage_id into v_proposal_id, v_lineage_id;
  insert into public.ai_workout_proposal_exercises (proposal_id, exercise_id, position)
  select v_proposal_id, id, ordinality - 1 from unnest(p_exercise_ids) with ordinality as item(id, ordinality);
  return query select v_proposal_id, v_lineage_id;
end;
$$;
create or replace function public.record_ai_workout_proposal(p_exercise_ids uuid[])
returns table (proposal_id uuid, lineage_id uuid)
language sql security invoker set search_path = '' as $$
  select * from private.record_ai_workout_proposal_for_current_user(p_exercise_ids);
$$;

create function private.append_ai_workout_proposal_event_for_current_user(
  p_proposal_id uuid, p_event_type public.ai_proposal_event_type, p_exercise_id uuid default null,
  p_replacement_exercise_id uuid default null, p_workout_id uuid default null
) returns void language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception using errcode = 'AR004', message = 'unauthenticated'; end if;
  if not exists (select 1 from public.ai_workout_proposals where id = p_proposal_id and user_id = v_user_id and expires_at > now()) then
    raise exception using errcode = 'AR002', message = 'proposal_not_available';
  end if;
  if p_event_type in ('removal', 'retention', 'swap') and not exists (
    select 1 from public.ai_workout_proposal_exercises where proposal_id = p_proposal_id and exercise_id = p_exercise_id
  ) then raise exception using errcode = 'AR003', message = 'validation_failed'; end if;
  if p_workout_id is not null and not exists (select 1 from public.workouts where id = p_workout_id and user_id = v_user_id) then
    raise exception using errcode = 'AR002', message = 'proposal_not_available'; end if;
  insert into public.ai_workout_proposal_events (proposal_id, user_id, event_type, exercise_id, replacement_exercise_id, workout_id)
  values (p_proposal_id, v_user_id, p_event_type, p_exercise_id, p_replacement_exercise_id, p_workout_id);
end;
$$;
create or replace function public.append_ai_workout_proposal_event(
  p_proposal_id uuid, p_event_type public.ai_proposal_event_type, p_exercise_id uuid default null,
  p_replacement_exercise_id uuid default null, p_workout_id uuid default null
) returns void language sql security invoker set search_path = '' as $$
  select private.append_ai_workout_proposal_event_for_current_user(p_proposal_id, p_event_type, p_exercise_id, p_replacement_exercise_id, p_workout_id);
$$;

create function private.register_ai_reduced_generation_confirmation_for_current_user(p_nonce_digest text, p_candidate_fingerprint text, p_allowed_count integer)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception using errcode = 'AR004', message = 'unauthenticated'; end if;
  insert into public.ai_reduced_generation_confirmations (nonce_digest, user_id, candidate_fingerprint, allowed_count)
  values (p_nonce_digest, v_user_id, p_candidate_fingerprint, p_allowed_count);
end;
$$;
create or replace function public.register_ai_reduced_generation_confirmation(p_nonce_digest text, p_candidate_fingerprint text, p_allowed_count integer)
returns void language sql security invoker set search_path = '' as $$
  select private.register_ai_reduced_generation_confirmation_for_current_user(p_nonce_digest, p_candidate_fingerprint, p_allowed_count);
$$;

create function private.consume_ai_reduced_generation_confirmation_for_current_user(p_nonce_digest text, p_candidate_fingerprint text, p_allowed_count integer)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception using errcode = 'AR004', message = 'unauthenticated'; end if;
  update public.ai_reduced_generation_confirmations set consumed_at = now()
  where nonce_digest = p_nonce_digest and user_id = v_user_id and candidate_fingerprint = p_candidate_fingerprint
    and allowed_count = p_allowed_count and consumed_at is null and expires_at > now();
  if not found then raise exception using errcode = 'AR001', message = 'confirmation_invalid'; end if;
end;
$$;
create or replace function public.consume_ai_reduced_generation_confirmation(p_nonce_digest text, p_candidate_fingerprint text, p_allowed_count integer)
returns void language sql security invoker set search_path = '' as $$
  select private.consume_ai_reduced_generation_confirmation_for_current_user(p_nonce_digest, p_candidate_fingerprint, p_allowed_count);
$$;

revoke all on function private.get_exercise_completion_profile_for_current_user(),
  private.set_ai_exercise_preference_for_current_user(uuid, public.ai_exercise_preference),
  private.get_ai_exercise_preferences_for_current_user(), private.record_ai_workout_proposal_for_current_user(uuid[]),
  private.append_ai_workout_proposal_event_for_current_user(uuid, public.ai_proposal_event_type, uuid, uuid, uuid),
  private.register_ai_reduced_generation_confirmation_for_current_user(text, text, integer),
  private.consume_ai_reduced_generation_confirmation_for_current_user(text, text, integer) from public, anon;
grant execute on function private.get_exercise_completion_profile_for_current_user(),
  private.set_ai_exercise_preference_for_current_user(uuid, public.ai_exercise_preference),
  private.get_ai_exercise_preferences_for_current_user(), private.record_ai_workout_proposal_for_current_user(uuid[]),
  private.append_ai_workout_proposal_event_for_current_user(uuid, public.ai_proposal_event_type, uuid, uuid, uuid),
  private.register_ai_reduced_generation_confirmation_for_current_user(text, text, integer),
  private.consume_ai_reduced_generation_confirmation_for_current_user(text, text, integer) to authenticated;

create unique index ai_workout_proposal_events_one_exposure_per_proposal_idx
  on public.ai_workout_proposal_events (proposal_id)
  where event_type = 'exposure';

create or replace function private.append_ai_workout_proposal_event_for_current_user(
  p_proposal_id uuid, p_event_type public.ai_proposal_event_type, p_exercise_id uuid default null,
  p_replacement_exercise_id uuid default null, p_workout_id uuid default null
) returns void language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception using errcode = 'AR004', message = 'unauthenticated'; end if;
  if not exists (
    select 1 from public.ai_workout_proposals
    where id = p_proposal_id and user_id = v_user_id and expires_at > now()
  ) then
    raise exception using errcode = 'AR002', message = 'proposal_not_available';
  end if;
  if p_event_type in ('removal', 'retention', 'swap') and not exists (
    select 1 from public.ai_workout_proposal_exercises
    where proposal_id = p_proposal_id and exercise_id = p_exercise_id
  ) then
    raise exception using errcode = 'AR003', message = 'validation_failed';
  end if;
  if p_workout_id is not null and not exists (
    select 1 from public.workouts where id = p_workout_id and user_id = v_user_id
  ) then
    raise exception using errcode = 'AR002', message = 'proposal_not_available';
  end if;
  if p_event_type = 'exposure' then
    insert into public.ai_workout_proposal_events (proposal_id, user_id, event_type)
    values (p_proposal_id, v_user_id, 'exposure')
    on conflict (proposal_id) where event_type = 'exposure' do nothing;
    return;
  end if;
  insert into public.ai_workout_proposal_events (
    proposal_id, user_id, event_type, exercise_id, replacement_exercise_id, workout_id
  ) values (
    p_proposal_id, v_user_id, p_event_type, p_exercise_id, p_replacement_exercise_id, p_workout_id
  );
end;
$$;

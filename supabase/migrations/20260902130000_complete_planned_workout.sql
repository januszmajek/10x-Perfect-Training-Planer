create function public.complete_planned_workout(
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
  where id = v_current_workout_id;

  return v_current_workout_id;
end;
$$;

revoke all on function public.complete_planned_workout(uuid, integer) from public, anon;

grant execute on function public.complete_planned_workout(uuid, integer) to authenticated;

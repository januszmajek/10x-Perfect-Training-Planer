alter table public.workouts
add column revision integer not null default 1,
add constraint workouts_revision_positive_check check (revision > 0);

grant update (revision) on table public.workouts to authenticated;

create function private.advance_planned_workout_revision()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.revision := old.revision + 1;
  return new;
end;
$$;

create trigger advance_planned_workout_revision_before_update
before update of revision on public.workouts
for each row
execute function private.advance_planned_workout_revision();

create function public.update_planned_workout(
  p_expected_workout_id uuid,
  p_expected_revision integer,
  p_exercises jsonb
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_current_workout_id uuid;
  v_current_revision integer;
  v_new_revision integer;
  v_exercise record;
begin
  if v_user_id is null then
    raise exception using errcode = 'PW003', message = 'unauthenticated';
  end if;

  if p_expected_workout_id is null
    or p_expected_revision is null
    or p_expected_revision < 1
    or p_exercises is null
    or jsonb_typeof(p_exercises) <> 'array'
    or jsonb_array_length(p_exercises) = 0
    or jsonb_array_length(p_exercises) > 20 then
    raise exception using errcode = 'PW002', message = 'validation_failed';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_exercises) as item(value)
    where jsonb_typeof(item.value) <> 'object'
      or case
        when jsonb_typeof(item.value) = 'object' then
          (select array_agg(key order by key) from jsonb_object_keys(item.value) as key)
            is distinct from array['exercise_id', 'reps', 'sets']::text[]
        else true
      end
      or jsonb_typeof(item.value -> 'exercise_id') <> 'string'
      or jsonb_typeof(item.value -> 'sets') <> 'number'
      or jsonb_typeof(item.value -> 'reps') <> 'number'
      or (item.value ->> 'exercise_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or (item.value ->> 'sets') !~ '^[1-9][0-9]*$'
      or (item.value ->> 'reps') !~ '^[1-9][0-9]*$'
      or length(item.value ->> 'sets') > 2
      or length(item.value ->> 'reps') > 3
  ) then
    raise exception using errcode = 'PW002', message = 'validation_failed';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_exercises) as item(value)
    group by item.value ->> 'exercise_id'
    having count(*) > 1
  ) or exists (
    select 1
    from jsonb_array_elements(p_exercises) as item(value)
    where not exists (
      select 1
      from public.exercises exercise
      where exercise.id = (item.value ->> 'exercise_id')::uuid
    )
  ) then
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

  delete from public.workout_exercises
  where workout_id = v_current_workout_id;

  for v_exercise in
    select
      (item.value ->> 'exercise_id')::uuid as exercise_id,
      (item.value ->> 'sets')::integer as sets,
      (item.value ->> 'reps')::integer as reps,
      item.ordinality - 1 as position
    from jsonb_array_elements(p_exercises) with ordinality as item(value, ordinality)
  loop
    insert into public.workout_exercises (workout_id, exercise_id, position, sets, reps)
    values (v_current_workout_id, v_exercise.exercise_id, v_exercise.position, v_exercise.sets, v_exercise.reps);
  end loop;

  update public.workouts
  set revision = revision
  where id = v_current_workout_id
  returning revision into v_new_revision;

  return v_new_revision;
end;
$$;

create function public.delete_planned_workout(
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

  delete from public.workouts
  where id = v_current_workout_id;

  return v_current_workout_id;
end;
$$;

drop function public.save_manual_planned_workout(jsonb, boolean, uuid);

create function public.save_manual_planned_workout(
  p_exercises jsonb,
  p_replace_existing boolean,
  p_expected_workout_id uuid default null,
  p_expected_revision integer default null
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
  v_new_workout_id uuid;
  v_exercise record;
begin
  if v_user_id is null then
    raise exception using errcode = 'MW004', message = 'unauthenticated';
  end if;

  if p_exercises is null
    or jsonb_typeof(p_exercises) <> 'array'
    or jsonb_array_length(p_exercises) = 0
    or jsonb_array_length(p_exercises) > 20
    or p_replace_existing is null
    or ((p_expected_workout_id is null) <> (p_expected_revision is null))
    or (p_expected_revision is not null and p_expected_revision < 1) then
    raise exception using errcode = 'MW003', message = 'validation_failed';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_exercises) as item(value)
    where jsonb_typeof(item.value) <> 'object'
      or case
        when jsonb_typeof(item.value) = 'object' then
          (select array_agg(key order by key) from jsonb_object_keys(item.value) as key)
            is distinct from array['exercise_id', 'reps', 'sets']::text[]
        else true
      end
      or jsonb_typeof(item.value -> 'exercise_id') <> 'string'
      or jsonb_typeof(item.value -> 'sets') <> 'number'
      or jsonb_typeof(item.value -> 'reps') <> 'number'
      or (item.value ->> 'exercise_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or (item.value ->> 'sets') !~ '^[1-9][0-9]*$'
      or (item.value ->> 'reps') !~ '^[1-9][0-9]*$'
      or length(item.value ->> 'sets') > 2
      or length(item.value ->> 'reps') > 3
  ) then
    raise exception using errcode = 'MW003', message = 'validation_failed';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_exercises) as item(value)
    group by item.value ->> 'exercise_id'
    having count(*) > 1
  ) or exists (
    select 1
    from jsonb_array_elements(p_exercises) as item(value)
    where not exists (
      select 1
      from public.exercises exercise
      where exercise.id = (item.value ->> 'exercise_id')::uuid
    )
  ) then
    raise exception using errcode = 'MW003', message = 'validation_failed';
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

  if p_expected_workout_id is null and v_current_workout_id is null and not p_replace_existing then
    null;
  elsif p_expected_workout_id is null and v_current_workout_id is not null then
    raise exception using errcode = 'MW001', message = 'confirmation_required';
  elsif p_expected_workout_id is not null
    and (
      v_current_workout_id is null
      or v_current_workout_id <> p_expected_workout_id
      or v_current_revision <> p_expected_revision
    ) then
    raise exception using errcode = 'MW002', message = 'stale_plan';
  elsif p_expected_workout_id = v_current_workout_id
    and p_expected_revision = v_current_revision
    and p_replace_existing then
    delete from public.workouts
    where id = v_current_workout_id;
  else
    raise exception using errcode = 'MW003', message = 'validation_failed';
  end if;

  insert into public.workouts (user_id, status, origin)
  values (v_user_id, 'planned', 'manual')
  returning id into v_new_workout_id;

  for v_exercise in
    select
      (item.value ->> 'exercise_id')::uuid as exercise_id,
      (item.value ->> 'sets')::integer as sets,
      (item.value ->> 'reps')::integer as reps,
      item.ordinality - 1 as position
    from jsonb_array_elements(p_exercises) with ordinality as item(value, ordinality)
  loop
    insert into public.workout_exercises (workout_id, exercise_id, position, sets, reps)
    values (v_new_workout_id, v_exercise.exercise_id, v_exercise.position, v_exercise.sets, v_exercise.reps);
  end loop;

  return v_new_workout_id;
end;
$$;

revoke all on function public.update_planned_workout(uuid, integer, jsonb) from public, anon;
revoke all on function public.delete_planned_workout(uuid, integer) from public, anon;
revoke all on function public.save_manual_planned_workout(jsonb, boolean, uuid, integer) from public, anon;

grant execute on function public.update_planned_workout(uuid, integer, jsonb) to authenticated;
grant execute on function public.delete_planned_workout(uuid, integer) to authenticated;
grant execute on function public.save_manual_planned_workout(jsonb, boolean, uuid, integer) to authenticated;

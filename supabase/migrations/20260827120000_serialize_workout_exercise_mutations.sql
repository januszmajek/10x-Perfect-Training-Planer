create schema if not exists private;

revoke all on schema private from public, anon, authenticated;

create function private.lock_planned_workout_for_exercise_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target_workout_id uuid;
  parent_status public.workout_status;
begin
  if tg_op = 'DELETE' then
    target_workout_id := old.workout_id;
  else
    target_workout_id := new.workout_id;
  end if;

  select workouts.status
  into parent_status
  from public.workouts
  where workouts.id = target_workout_id
  for update;

  if found and parent_status <> 'planned' then
    raise exception using
      errcode = '55000',
      message = 'workout exercises can only be changed while the workout is planned';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create trigger lock_planned_workout_before_exercise_mutation
before insert or update or delete on public.workout_exercises
for each row
execute function private.lock_planned_workout_for_exercise_mutation();

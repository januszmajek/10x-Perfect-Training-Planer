create function public.get_exercise_completion_profile()
returns table (
  exercise_id uuid,
  completed_count bigint,
  last_completed_at timestamp with time zone,
  in_last_completed_workout boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  with completed_workouts as (
    select workout.id, workout.completed_at
    from public.workouts workout
    where workout.user_id = auth.uid()
      and workout.status = 'completed'
  ), latest_workout as (
    select id
    from completed_workouts
    order by completed_at desc, id desc
    limit 1
  )
  select
    workout_exercise.exercise_id,
    count(*)::bigint as completed_count,
    max(completed_workouts.completed_at) as last_completed_at,
    bool_or(completed_workouts.id = (select id from latest_workout)) as in_last_completed_workout
  from completed_workouts
  join public.workout_exercises workout_exercise on workout_exercise.workout_id = completed_workouts.id
  group by workout_exercise.exercise_id;
$$;

revoke all on function public.get_exercise_completion_profile() from public, anon;
grant execute on function public.get_exercise_completion_profile() to authenticated;

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select has_function('public', 'get_exercise_completion_profile', array[]::text[], 'completion profile RPC exists');
select ok(
  (select prosecdef = false and proconfig @> array['search_path=""'] from pg_proc where oid = 'public.get_exercise_completion_profile()'::regprocedure),
  'profile RPC is security invoker with an empty search path'
);
select ok(has_function_privilege('authenticated', 'public.get_exercise_completion_profile()', 'execute'), 'authenticated can execute profile RPC');
select ok(not has_function_privilege('anon', 'public.get_exercise_completion_profile()', 'execute'), 'anonymous users cannot execute profile RPC');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000801', 'profile-owner@example.test'),
  ('00000000-0000-0000-0000-000000000802', 'profile-other@example.test');
alter table public.workout_exercises disable trigger lock_planned_workout_before_exercise_mutation;
insert into public.workouts (id, user_id, origin, status, created_at, completed_at) values
  ('00000000-0000-0000-0000-000000000811', '00000000-0000-0000-0000-000000000801', 'manual', 'completed', '2025-12-01T10:00:00Z', '2026-01-01T10:00:00Z'),
  ('00000000-0000-0000-0000-000000000812', '00000000-0000-0000-0000-000000000801', 'ai', 'completed', '2025-12-01T10:00:00Z', '2026-01-02T10:00:00Z'),
  ('00000000-0000-0000-0000-000000000813', '00000000-0000-0000-0000-000000000801', 'manual', 'planned', '2025-12-01T10:00:00Z', null),
  ('00000000-0000-0000-0000-000000000814', '00000000-0000-0000-0000-000000000802', 'manual', 'completed', '2025-12-01T10:00:00Z', '2026-01-03T10:00:00Z');
insert into public.workout_exercises (workout_id, exercise_id, position, sets, reps) values
  ('00000000-0000-0000-0000-000000000811', (select id from public.exercises where slug = 'barbell-bench-press'), 0, 3, 10),
  ('00000000-0000-0000-0000-000000000812', (select id from public.exercises where slug = 'barbell-bench-press'), 0, 3, 10),
  ('00000000-0000-0000-0000-000000000812', (select id from public.exercises where slug = 'back-squat'), 1, 3, 10),
  ('00000000-0000-0000-0000-000000000813', (select id from public.exercises where slug = 'front-squat'), 0, 3, 10),
  ('00000000-0000-0000-0000-000000000814', (select id from public.exercises where slug = 'front-squat'), 0, 3, 10);
alter table public.workout_exercises enable trigger lock_planned_workout_before_exercise_mutation;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000801', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select is(
  (select jsonb_agg(jsonb_build_object('count', completed_count, 'last', last_completed_at, 'latest', in_last_completed_workout) order by completed_count desc, exercise_id)
   from public.get_exercise_completion_profile()),
  jsonb_build_array(
    jsonb_build_object('count', 2, 'last', '2026-01-02T10:00:00+00'::timestamptz, 'latest', true),
    jsonb_build_object('count', 1, 'last', '2026-01-02T10:00:00+00'::timestamptz, 'latest', true)
  ),
  'profile aggregates completed workouts only and marks every exercise in the deterministic latest workout'
);
select is((select count(*) from public.get_exercise_completion_profile()), 2::bigint, 'other owners and planned workouts are absent');
reset role;

select * from finish();
rollback;

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select no_plan();

select has_function(
  'public',
  'save_ai_planned_workout',
  array['jsonb', 'boolean', 'uuid', 'integer'],
  'AI workout save function has the public RPC signature'
);
select function_returns(
  'public',
  'save_ai_planned_workout',
  array['jsonb', 'boolean', 'uuid', 'integer'],
  'uuid',
  'AI workout save function returns the saved workout UUID'
);
select is(
  (select prosecdef from pg_proc where oid = 'public.save_ai_planned_workout(jsonb, boolean, uuid, integer)'::regprocedure),
  false,
  'AI workout save function is SECURITY INVOKER'
);
select is(
  (select proconfig @> array['search_path=""'] from pg_proc where oid = 'public.save_ai_planned_workout(jsonb, boolean, uuid, integer)'::regprocedure),
  true,
  'AI workout save function has an empty search path'
);
select ok(
  has_function_privilege('authenticated', 'public.save_ai_planned_workout(jsonb, boolean, uuid, integer)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.save_ai_planned_workout(jsonb, boolean, uuid, integer)', 'EXECUTE'),
  'only authenticated users can execute the AI workout RPC'
);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000071', 'ai-rpc-owner@example.test'),
  ('00000000-0000-0000-0000-000000000072', 'ai-rpc-other@example.test');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000071', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select throws_ok(
  $$select public.save_ai_planned_workout('[]'::jsonb, false, null, null)$$,
  'AW003'::character(5), 'validation_failed', 'empty prescriptions are rejected'
);
select throws_ok(
  $$select public.save_ai_planned_workout('[{"exercise_id":"not-a-uuid","sets":3,"reps":10}]'::jsonb, false, null, null)$$,
  'AW003'::character(5), 'validation_failed', 'malformed exercise IDs are rejected'
);
select throws_ok(
  $$select public.save_ai_planned_workout('[{"exercise_id":"00000000-0000-0000-0000-000000000000","sets":3,"reps":10}]'::jsonb, false, null, null)$$,
  'AW003'::character(5), 'validation_failed', 'unknown exercises are rejected'
);
select throws_ok(
  $$select public.save_ai_planned_workout('[{"exercise_id":"11111111-1111-1111-1111-111111111111","sets":3,"reps":10},{"exercise_id":"11111111-1111-1111-1111-111111111111","sets":4,"reps":8}]'::jsonb, false, null, null)$$,
  'AW003'::character(5), 'validation_failed', 'duplicate exercises are rejected'
);

select lives_ok(
  $$
    select public.save_ai_planned_workout(
      jsonb_build_array(
        jsonb_build_object('exercise_id', (select id from public.exercises where slug = 'barbell-bench-press'), 'sets', 3, 'reps', 10),
        jsonb_build_object('exercise_id', (select id from public.exercises where slug = 'back-squat'), 'sets', 4, 'reps', 8)
      ), false, null, null
    )
  $$,
  'an authenticated user can create an AI-origin planned workout'
);
select is(
  (select origin::text from public.workouts where user_id = '00000000-0000-0000-0000-000000000071' and status = 'planned'),
  'ai', 'the RPC derives AI origin server-side'
);
select is(
  (select jsonb_agg(jsonb_build_object('position', position, 'sets', sets, 'reps', reps) order by position)
    from public.workout_exercises where workout_id = (
      select id from public.workouts where user_id = '00000000-0000-0000-0000-000000000071' and status = 'planned'
    )),
  '[{"position": 0, "reps": 10, "sets": 3}, {"position": 1, "reps": 8, "sets": 4}]'::jsonb,
  'the RPC derives positions from array order'
);
select throws_ok(
  $$select public.save_ai_planned_workout(jsonb_build_array(jsonb_build_object('exercise_id', (select id from public.exercises where slug = 'front-squat'), 'sets', 3, 'reps', 10)), false, null, null)$$,
  'AW001'::character(5), 'confirmation_required', 'unconfirmed replacement preserves the existing plan'
);
select throws_ok(
  $$select public.save_ai_planned_workout(jsonb_build_array(jsonb_build_object('exercise_id', (select id from public.exercises where slug = 'front-squat'), 'sets', 3, 'reps', 10)), true, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1)$$,
  'AW002'::character(5), 'stale_plan', 'stale expected IDs are rejected'
);
select lives_ok(
  $$select public.save_ai_planned_workout(jsonb_build_array(jsonb_build_object('exercise_id', (select id from public.exercises where slug = 'front-squat'), 'sets', 3, 'reps', 10)), true, (select id from public.workouts where user_id = '00000000-0000-0000-0000-000000000071' and status = 'planned'), (select revision from public.workouts where user_id = '00000000-0000-0000-0000-000000000071' and status = 'planned'))$$,
  'matching confirmation atomically replaces the plan'
);
select is((select count(*) from public.workouts where user_id = '00000000-0000-0000-0000-000000000071' and status = 'planned'), 1::bigint, 'confirmed replacement leaves one planned workout');
select is((select count(*) from public.workouts where user_id = '00000000-0000-0000-0000-000000000071' and status = 'completed'), 0::bigint, 'AI saving preserves completed history');

reset role;
select set_config(
  'test.ai_workout_parent_before_failure',
  (select to_jsonb(workout)::text from public.workouts workout where workout.user_id = '00000000-0000-0000-0000-000000000071' and workout.status = 'planned'),
  true
);
select set_config(
  'test.ai_workout_children_before_failure',
  (select jsonb_agg(to_jsonb(workout_exercise) order by workout_exercise.position)::text from public.workout_exercises workout_exercise where workout_exercise.workout_id = (
    select id from public.workouts where user_id = '00000000-0000-0000-0000-000000000071' and status = 'planned'
  )),
  true
);
create function public.fail_ai_workout_test_child_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.sets = 77 then
    raise exception using errcode = '23514', message = 'forced child insert failure';
  end if;
  return new;
end;
$$;
create trigger fail_ai_workout_test_child_insert
before insert on public.workout_exercises
for each row execute function public.fail_ai_workout_test_child_insert();

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000071', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select throws_ok(
  $$select public.save_ai_planned_workout(jsonb_build_array(jsonb_build_object('exercise_id', (select id from public.exercises where slug = 'front-squat'), 'sets', 77, 'reps', 10)), true, (select id from public.workouts where user_id = '00000000-0000-0000-0000-000000000071' and status = 'planned'), (select revision from public.workouts where user_id = '00000000-0000-0000-0000-000000000071' and status = 'planned'))$$,
  '23514'::character(5), 'forced child insert failure', 'child insertion failures roll back the replacement transaction'
);
reset role;
select is(
  (select to_jsonb(workout) from public.workouts workout where workout.user_id = '00000000-0000-0000-0000-000000000071' and workout.status = 'planned'),
  current_setting('test.ai_workout_parent_before_failure')::jsonb,
  'rollback preserves the original planned-workout parent'
);
select is(
  (select jsonb_agg(to_jsonb(workout_exercise) order by workout_exercise.position) from public.workout_exercises workout_exercise where workout_exercise.workout_id = (
    select id from public.workouts where user_id = '00000000-0000-0000-0000-000000000071' and status = 'planned'
  )),
  current_setting('test.ai_workout_children_before_failure')::jsonb,
  'rollback preserves the original planned-workout prescriptions'
);

select set_config(
  'test.ai_workout_owner_plan_id',
  (select id::text from public.workouts where user_id = '00000000-0000-0000-0000-000000000071' and status = 'planned'),
  true
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000072', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select throws_ok(
  $$select public.save_ai_planned_workout(jsonb_build_array(jsonb_build_object('exercise_id', (select id from public.exercises where slug = 'front-squat'), 'sets', 3, 'reps', 10)), true, current_setting('test.ai_workout_owner_plan_id')::uuid, 1)$$,
  'AW002'::character(5), 'stale_plan', 'a second user cannot replace another owner plan'
);
select is((select count(*) from public.workouts where user_id = '00000000-0000-0000-0000-000000000072'), 0::bigint, 'cross-owner save creates no rows');

reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', '', true);
select throws_ok(
  $$select public.save_ai_planned_workout('[]'::jsonb, false, null, null)$$,
  'AW004'::character(5), 'unauthenticated', 'unauthenticated calls receive the stable SQLSTATE'
);

select * from finish();
rollback;

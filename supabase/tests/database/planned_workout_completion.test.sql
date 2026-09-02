begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select no_plan();

select has_function(
  'public',
  'complete_planned_workout',
  array['uuid', 'integer'],
  'planned workout completion has the public RPC signature'
);
select function_returns(
  'public',
  'complete_planned_workout',
  array['uuid', 'integer'],
  'uuid',
  'planned workout completion returns the completed workout UUID'
);
select ok(
  not (select prosecdef from pg_proc where oid = 'public.complete_planned_workout(uuid, integer)'::regprocedure),
  'planned workout completion is SECURITY INVOKER'
);
select ok(
  (select proconfig @> array['search_path=""'] from pg_proc where oid = 'public.complete_planned_workout(uuid, integer)'::regprocedure),
  'planned workout completion has an empty search path'
);
select ok(
  has_function_privilege('authenticated', 'public.complete_planned_workout(uuid, integer)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.complete_planned_workout(uuid, integer)', 'EXECUTE'),
  'only authenticated users can execute planned workout completion'
);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000061', 'completion-owner@example.test'),
  ('00000000-0000-0000-0000-000000000062', 'completion-other@example.test');

insert into public.workouts (id, user_id, status, origin, created_at)
values
  (
    '61000000-0000-0000-0000-000000000061',
    '00000000-0000-0000-0000-000000000061',
    'planned',
    'ai',
    '2026-09-01 10:00:00+00'
  ),
  (
    '62000000-0000-0000-0000-000000000062',
    '00000000-0000-0000-0000-000000000062',
    'planned',
    'manual',
    '2026-09-01 11:00:00+00'
  );

insert into public.workout_exercises (workout_id, exercise_id, position, sets, reps)
select '61000000-0000-0000-0000-000000000061', id, 0, 3, 10
from public.exercises
where slug = 'barbell-bench-press';
insert into public.workout_exercises (workout_id, exercise_id, position, sets, reps)
select '61000000-0000-0000-0000-000000000061', id, 1, 4, 8
from public.exercises
where slug = 'back-squat';
insert into public.workout_exercises (workout_id, exercise_id, position, sets, reps)
select '62000000-0000-0000-0000-000000000062', id, 0, 5, 5
from public.exercises
where slug = 'conventional-deadlift';

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000061', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select throws_ok(
  $$select public.complete_planned_workout(null, 1)$$,
  'PW002'::character(5),
  'validation_failed',
  'completion rejects a null expected workout ID'
);
select throws_ok(
  $$select public.complete_planned_workout('61000000-0000-0000-0000-000000000061', 0)$$,
  'PW002'::character(5),
  'validation_failed',
  'completion rejects a non-positive expected revision'
);

reset role;
select set_config(
  'test.completion_parent_before',
  (select (to_jsonb(workout) - 'status' - 'completed_at')::text from public.workouts workout where id = '61000000-0000-0000-0000-000000000061'),
  true
);
select set_config(
  'test.completion_children_before',
  (
    select jsonb_agg(to_jsonb(item) order by item.position)::text
    from public.workout_exercises item
    where item.workout_id = '61000000-0000-0000-0000-000000000061'
  ),
  true
);

set local role authenticated;
select is(
  public.complete_planned_workout('61000000-0000-0000-0000-000000000061', 1),
  '61000000-0000-0000-0000-000000000061'::uuid,
  'completion returns the exact matched AI-origin workout ID'
);

reset role;
select is(
  (select to_jsonb(workout) - 'status' - 'completed_at' from public.workouts workout where id = '61000000-0000-0000-0000-000000000061'),
  current_setting('test.completion_parent_before')::jsonb,
  'completion preserves identity, owner, origin, creation time, and revision'
);
select is(
  (
    select jsonb_agg(to_jsonb(item) order by item.position)
    from public.workout_exercises item
    where item.workout_id = '61000000-0000-0000-0000-000000000061'
  ),
  current_setting('test.completion_children_before')::jsonb,
  'completion preserves the exact ordered prescription'
);
select ok(
  (select status = 'completed' and completed_at is not null and completed_at >= created_at from public.workouts where id = '61000000-0000-0000-0000-000000000061'),
  'completion writes a database-owned lifecycle timestamp'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000061', true);
set local role authenticated;
select throws_ok(
  $$select public.complete_planned_workout('61000000-0000-0000-0000-000000000061', 1)$$,
  'PW001'::character(5),
  'stale_plan',
  'repeated completion is stale and leaves immutable history unchanged'
);
select lives_ok(
  $$insert into public.workouts (user_id, status, origin) values ('00000000-0000-0000-0000-000000000061', 'planned', 'manual')$$,
  'completion frees the owner planned-workout slot'
);
select is(
  (select count(*) from public.workouts where user_id = '00000000-0000-0000-0000-000000000061' and status = 'completed'),
  1::bigint,
  'completion retains immutable history while allowing a new plan'
);
select set_config(
  'test.completion_manual_plan_id',
  (select id::text from public.workouts where user_id = '00000000-0000-0000-0000-000000000061' and status = 'planned'),
  true
);
select is(
  public.complete_planned_workout(
    current_setting('test.completion_manual_plan_id')::uuid,
    1
  ),
  current_setting('test.completion_manual_plan_id')::uuid,
  'completion returns the exact matched manual-origin workout ID'
);
select is(
  (select count(*) from public.workouts where user_id = '00000000-0000-0000-0000-000000000061' and status = 'completed'),
  2::bigint,
  'manual- and AI-origin completion both preserve durable history'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000062', true);
select throws_ok(
  $$select public.complete_planned_workout('61000000-0000-0000-0000-000000000061', 1)$$,
  'PW001'::character(5),
  'stale_plan',
  'another owner cannot discover or complete a supplied workout ID'
);
select is(
  (select status::text from public.workouts where id = '62000000-0000-0000-0000-000000000062'),
  'planned',
  'cross-user completion leaves the other owner plan unchanged'
);

reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', '', true);
select throws_ok(
  $$select public.complete_planned_workout('61000000-0000-0000-0000-000000000061', 1)$$,
  'PW003'::character(5),
  'unauthenticated',
  'unauthenticated completion uses the stable SQLSTATE'
);

select * from finish();
rollback;

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select no_plan();

select has_function(
  'public',
  'save_manual_planned_workout',
  array['jsonb', 'boolean', 'uuid', 'integer'],
  'manual workout save function has the public RPC signature'
);
select function_returns(
  'public',
  'save_manual_planned_workout',
  array['jsonb', 'boolean', 'uuid', 'integer'],
  'uuid',
  'manual workout save function returns the saved workout UUID'
);
select is(
  (select prosecdef from pg_proc where oid = 'public.save_manual_planned_workout(jsonb, boolean, uuid, integer)'::regprocedure),
  false,
  'manual workout save function is SECURITY INVOKER'
);
select is(
  (select proconfig @> array['search_path=""'] from pg_proc where oid = 'public.save_manual_planned_workout(jsonb, boolean, uuid, integer)'::regprocedure),
  true,
  'manual workout save function has an empty search path'
);
select ok(
  has_function_privilege('authenticated', 'public.save_manual_planned_workout(jsonb, boolean, uuid, integer)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.save_manual_planned_workout(jsonb, boolean, uuid, integer)', 'EXECUTE')
    and to_regprocedure('public.save_manual_planned_workout(jsonb, boolean, uuid)') is null,
  'only authenticated users can execute the manual workout RPC'
);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000021', 'manual-rpc-owner@example.test'),
  ('00000000-0000-0000-0000-000000000022', 'manual-rpc-other@example.test');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000021', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select throws_ok(
  $$select public.save_manual_planned_workout('[]'::jsonb, false, null, null)$$,
  'MW003'::character(5),
  'validation_failed',
  'empty prescriptions are rejected with the public validation SQLSTATE'
);
select throws_ok(
  $$select public.save_manual_planned_workout('[{"exercise_id":"not-a-uuid","sets":3,"reps":10}]'::jsonb, false, null, null)$$,
  'MW003'::character(5),
  'validation_failed',
  'malformed exercise IDs are rejected before mutation'
);
select throws_ok(
  $$select public.save_manual_planned_workout('[{"exercise_id":"00000000-0000-0000-0000-000000000000","sets":3,"reps":10}]'::jsonb, false, null, null)$$,
  'MW003'::character(5),
  'validation_failed',
  'unknown catalogue exercise IDs are rejected before mutation'
);
select throws_ok(
  $$select public.save_manual_planned_workout('[{"exercise_id":"11111111-1111-1111-1111-111111111111","sets":0,"reps":10}]'::jsonb, false, null, null)$$,
  'MW003'::character(5),
  'validation_failed',
  'non-positive prescriptions are rejected before UUID lookup'
);
select throws_ok(
  $$select public.save_manual_planned_workout('[{"exercise_id":"11111111-1111-1111-1111-111111111111","sets":3,"reps":10,"position":0}]'::jsonb, false, null, null)$$,
  'MW003'::character(5),
  'validation_failed',
  'caller-supplied positions and unknown JSON keys are rejected'
);
select throws_ok(
  $$select public.save_manual_planned_workout('[{"exercise_id":"11111111-1111-1111-1111-111111111111","sets":3,"reps":10},{"exercise_id":"11111111-1111-1111-1111-111111111111","sets":4,"reps":8}]'::jsonb, false, null, null)$$,
  'MW003'::character(5),
  'validation_failed',
  'duplicate exercise IDs are rejected before mutation'
);

select lives_ok(
  $$
    select public.save_manual_planned_workout(
      jsonb_build_array(
        jsonb_build_object('exercise_id', (select id from public.exercises where slug = 'barbell-bench-press'), 'sets', 3, 'reps', 10),
        jsonb_build_object('exercise_id', (select id from public.exercises where slug = 'back-squat'), 'sets', 4, 'reps', 8)
      ),
      false,
      null,
      null
    )
  $$,
  'an authenticated user can create their first manual planned workout'
);
select is(
  (select count(*) from public.workouts where user_id = '00000000-0000-0000-0000-000000000021' and status = 'planned'),
  1::bigint,
  'the first save creates exactly one planned workout'
);
select is(
  (select origin::text from public.workouts where user_id = '00000000-0000-0000-0000-000000000021' and status = 'planned'),
  'manual',
  'the RPC derives manual origin server-side'
);
select is(
  (
    select jsonb_agg(jsonb_build_object('position', position, 'sets', sets, 'reps', reps) order by position)
    from public.workout_exercises
    where workout_id = (select id from public.workouts where user_id = '00000000-0000-0000-0000-000000000021' and status = 'planned')
  ),
  '[{"position": 0, "reps": 10, "sets": 3}, {"position": 1, "reps": 8, "sets": 4}]'::jsonb,
  'the RPC derives contiguous array-order positions and exact prescriptions'
);

select throws_ok(
  $$
    select public.save_manual_planned_workout(
      jsonb_build_array(jsonb_build_object('exercise_id', (select id from public.exercises where slug = 'conventional-deadlift'), 'sets', 3, 'reps', 5)),
      false,
      null,
      null
    )
  $$,
  'MW001'::character(5),
  'confirmation_required',
  'a second save without confirmation does not replace the current plan'
);
select is(
  (select count(*) from public.workout_exercises where workout_id = (select id from public.workouts where user_id = '00000000-0000-0000-0000-000000000021' and status = 'planned')),
  2::bigint,
  'unconfirmed replacement preserves the existing prescription'
);
select throws_ok(
  $$
    select public.save_manual_planned_workout(
      jsonb_build_array(jsonb_build_object('exercise_id', (select id from public.exercises where slug = 'conventional-deadlift'), 'sets', 3, 'reps', 5)),
      true,
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      1
    )
  $$,
  'MW002'::character(5),
  'stale_plan',
  'an unmatched expected plan ID is rejected as stale'
);

update public.workouts
set revision = 999
where user_id = '00000000-0000-0000-0000-000000000021'
  and status = 'planned';

select is(
  (select revision from public.workouts where user_id = '00000000-0000-0000-0000-000000000021' and status = 'planned'),
  2,
  'the database derives the next revision instead of accepting a caller-selected value'
);
select throws_ok(
  $$
    select public.save_manual_planned_workout(
      jsonb_build_array(jsonb_build_object('exercise_id', (select id from public.exercises where slug = 'conventional-deadlift'), 'sets', 3, 'reps', 5)),
      true,
      (select id from public.workouts where user_id = '00000000-0000-0000-0000-000000000021' and status = 'planned'),
      1
    )
  $$,
  'MW002'::character(5),
  'stale_plan',
  'a replacement opened before an in-place revision advance is rejected as stale'
);

select lives_ok(
  $$
    select public.save_manual_planned_workout(
      jsonb_build_array(jsonb_build_object('exercise_id', (select id from public.exercises where slug = 'conventional-deadlift'), 'sets', 5, 'reps', 5)),
      true,
      (select id from public.workouts where user_id = '00000000-0000-0000-0000-000000000021' and status = 'planned'),
      (select revision from public.workouts where user_id = '00000000-0000-0000-0000-000000000021' and status = 'planned')
    )
  $$,
  'a matching explicit confirmation atomically replaces the plan'
);
select is(
  (select count(*) from public.workouts where user_id = '00000000-0000-0000-0000-000000000021' and status = 'planned'),
  1::bigint,
  'confirmed replacement still leaves exactly one planned workout'
);
select is(
  (select count(*) from public.workout_exercises where workout_id = (select id from public.workouts where user_id = '00000000-0000-0000-0000-000000000021' and status = 'planned')),
  1::bigint,
  'replacement cascades the previous prescription and stores the new one'
);
select is(
  (select count(*) from public.workouts where user_id = '00000000-0000-0000-0000-000000000021' and status = 'completed'),
  0::bigint,
  'replacement does not fabricate completed history'
);

reset role;
select set_config(
  'test.manual_workout_parent_before_failure',
  (
    select to_jsonb(workout)::text
    from public.workouts workout
    where workout.user_id = '00000000-0000-0000-0000-000000000021'
      and workout.status = 'planned'
  ),
  true
);
select set_config(
  'test.manual_workout_children_before_failure',
  (
    select jsonb_agg(to_jsonb(workout_exercise) order by workout_exercise.position)::text
    from public.workout_exercises workout_exercise
    where workout_exercise.workout_id = (
      select workout.id
      from public.workouts workout
      where workout.user_id = '00000000-0000-0000-0000-000000000021'
        and workout.status = 'planned'
    )
  ),
  true
);

create function public.fail_manual_workout_test_child_insert()
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

create trigger fail_manual_workout_test_child_insert
before insert on public.workout_exercises
for each row
execute function public.fail_manual_workout_test_child_insert();

set local role authenticated;
select throws_ok(
  $$
    select public.save_manual_planned_workout(
      jsonb_build_array(jsonb_build_object('exercise_id', (select id from public.exercises where slug = 'front-squat'), 'sets', 77, 'reps', 10)),
      true,
      (select id from public.workouts where user_id = '00000000-0000-0000-0000-000000000021' and status = 'planned'),
      (select revision from public.workouts where user_id = '00000000-0000-0000-0000-000000000021' and status = 'planned')
    )
  $$,
  '23514'::character(5),
  'forced child insert failure',
  'a child insert failure aborts the confirmed replacement'
);

reset role;
select is(
  (
    select to_jsonb(workout)
    from public.workouts workout
    where workout.user_id = '00000000-0000-0000-0000-000000000021'
      and workout.status = 'planned'
  ),
  current_setting('test.manual_workout_parent_before_failure')::jsonb,
  'failed replacement restores the prior parent byte-for-byte'
);
select is(
  (
    select jsonb_agg(to_jsonb(workout_exercise) order by workout_exercise.position)
    from public.workout_exercises workout_exercise
    where workout_exercise.workout_id = (
      select workout.id
      from public.workouts workout
      where workout.user_id = '00000000-0000-0000-0000-000000000021'
        and workout.status = 'planned'
    )
  ),
  current_setting('test.manual_workout_children_before_failure')::jsonb,
  'failed replacement restores every prior prescription byte-for-byte'
);

drop trigger fail_manual_workout_test_child_insert on public.workout_exercises;
drop function public.fail_manual_workout_test_child_insert();

insert into public.workouts (id, user_id, status, origin, completed_at)
values (
  '20000000-0000-0000-0000-000000000021',
  '00000000-0000-0000-0000-000000000021',
  'completed',
  'manual',
  now()
);

set local role authenticated;
select lives_ok(
  $$
    select public.save_manual_planned_workout(
      jsonb_build_array(jsonb_build_object('exercise_id', (select id from public.exercises where slug = 'front-squat'), 'sets', 3, 'reps', 10)),
      true,
      (select id from public.workouts where user_id = '00000000-0000-0000-0000-000000000021' and status = 'planned'),
      (select revision from public.workouts where user_id = '00000000-0000-0000-0000-000000000021' and status = 'planned')
    )
  $$,
  'replacement does not select or change completed history'
);

reset role;
select is(
  (select count(*) from public.workouts where id = '20000000-0000-0000-0000-000000000021' and status = 'completed'),
  1::bigint,
  'completed history remains present after a planned replacement'
);
select set_config(
  'test.manual_workout_owner_plan_id',
  (
    select workout.id::text
    from public.workouts workout
    where workout.user_id = '00000000-0000-0000-0000-000000000021'
      and workout.status = 'planned'
  ),
  true
);
select set_config(
  'test.manual_workout_owner_plan_before_cross_user_attempt',
  (
    select to_jsonb(workout)::text
    from public.workouts workout
    where workout.id = current_setting('test.manual_workout_owner_plan_id')::uuid
  ),
  true
);
select set_config(
  'test.manual_workout_owner_children_before_cross_user_attempt',
  (
    select jsonb_agg(to_jsonb(workout_exercise) order by workout_exercise.position)::text
    from public.workout_exercises workout_exercise
    where workout_exercise.workout_id = current_setting('test.manual_workout_owner_plan_id')::uuid
  ),
  true
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000022', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select throws_ok(
  $$
    select public.save_manual_planned_workout(
      jsonb_build_array(jsonb_build_object('exercise_id', (select id from public.exercises where slug = 'front-squat'), 'sets', 3, 'reps', 10)),
      true,
      current_setting('test.manual_workout_owner_plan_id')::uuid,
      1
    )
  $$,
  'MW002'::character(5),
  'stale_plan',
  'a second user cannot replace another owner''s plan through a supplied ID'
);
select is(
  (select count(*) from public.workouts where user_id = '00000000-0000-0000-0000-000000000022'),
  0::bigint,
  'cross-user replacement attempts create no rows'
);

reset role;
select is(
  (
    select to_jsonb(workout)
    from public.workouts workout
    where workout.id = current_setting('test.manual_workout_owner_plan_id')::uuid
  ),
  current_setting('test.manual_workout_owner_plan_before_cross_user_attempt')::jsonb,
  'cross-user replacement preserves the owner parent byte-for-byte'
);
select is(
  (
    select jsonb_agg(to_jsonb(workout_exercise) order by workout_exercise.position)
    from public.workout_exercises workout_exercise
    where workout_exercise.workout_id = current_setting('test.manual_workout_owner_plan_id')::uuid
  ),
  current_setting('test.manual_workout_owner_children_before_cross_user_attempt')::jsonb,
  'cross-user replacement preserves the owner prescriptions byte-for-byte'
);

select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', '', true);
select throws_ok(
  $$select public.save_manual_planned_workout('[]'::jsonb, false, null, null)$$,
  'MW004'::character(5),
  'unauthenticated',
  'unauthenticated calls get the stable unauthenticated SQLSTATE'
);

select * from finish();
rollback;

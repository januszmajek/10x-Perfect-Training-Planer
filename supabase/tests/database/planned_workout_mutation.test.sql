begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select no_plan();

select has_function(
  'public',
  'update_planned_workout',
  array['uuid', 'integer', 'jsonb'],
  'planned workout update has the public RPC signature'
);
select function_returns(
  'public',
  'update_planned_workout',
  array['uuid', 'integer', 'jsonb'],
  'integer',
  'planned workout update returns the new revision'
);
select has_function(
  'public',
  'delete_planned_workout',
  array['uuid', 'integer'],
  'planned workout delete has the public RPC signature'
);
select function_returns(
  'public',
  'delete_planned_workout',
  array['uuid', 'integer'],
  'uuid',
  'planned workout delete returns the deleted workout UUID'
);
select ok(
  not (select prosecdef from pg_proc where oid = 'public.update_planned_workout(uuid, integer, jsonb)'::regprocedure)
    and not (select prosecdef from pg_proc where oid = 'public.delete_planned_workout(uuid, integer)'::regprocedure),
  'planned workout mutation functions are SECURITY INVOKER'
);
select ok(
  (select proconfig @> array['search_path=""'] from pg_proc where oid = 'public.update_planned_workout(uuid, integer, jsonb)'::regprocedure)
    and (select proconfig @> array['search_path=""'] from pg_proc where oid = 'public.delete_planned_workout(uuid, integer)'::regprocedure),
  'planned workout mutation functions have empty search paths'
);
select ok(
  has_function_privilege('authenticated', 'public.update_planned_workout(uuid, integer, jsonb)', 'EXECUTE')
    and has_function_privilege('authenticated', 'public.delete_planned_workout(uuid, integer)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.update_planned_workout(uuid, integer, jsonb)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.delete_planned_workout(uuid, integer)', 'EXECUTE'),
  'only authenticated users can execute planned workout mutations'
);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000041', 'planned-rpc-owner@example.test'),
  ('00000000-0000-0000-0000-000000000042', 'planned-rpc-other@example.test');

insert into public.workouts (id, user_id, status, origin, created_at)
values
  (
    '41000000-0000-0000-0000-000000000041',
    '00000000-0000-0000-0000-000000000041',
    'planned',
    'ai',
    '2026-09-01 10:00:00+00'
  ),
  (
    '42000000-0000-0000-0000-000000000042',
    '00000000-0000-0000-0000-000000000042',
    'planned',
    'manual',
    '2026-09-01 11:00:00+00'
  );

insert into public.workout_exercises (workout_id, exercise_id, position, sets, reps)
select '41000000-0000-0000-0000-000000000041', id, 0, 3, 10
from public.exercises where slug = 'barbell-bench-press';
insert into public.workout_exercises (workout_id, exercise_id, position, sets, reps)
select '42000000-0000-0000-0000-000000000042', id, 0, 4, 8
from public.exercises where slug = 'back-squat';

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000041', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select throws_ok(
  $$select public.update_planned_workout('41000000-0000-0000-0000-000000000041', 1, '[]'::jsonb)$$,
  'PW002'::character(5),
  'validation_failed',
  'empty updates are rejected before mutation'
);
select throws_ok(
  $$select public.update_planned_workout('41000000-0000-0000-0000-000000000041', 1, '[{"exercise_id":"not-a-uuid","sets":3,"reps":10}]'::jsonb)$$,
  'PW002'::character(5),
  'validation_failed',
  'malformed edit payloads are rejected before mutation'
);
select throws_ok(
  $$select public.delete_planned_workout('41000000-0000-0000-0000-000000000041', 0)$$,
  'PW002'::character(5),
  'validation_failed',
  'delete rejects a non-positive revision'
);

reset role;
select set_config(
  'test.planned_parent_before_failure',
  (select to_jsonb(workout)::text from public.workouts workout where id = '41000000-0000-0000-0000-000000000041'),
  true
);
select set_config(
  'test.planned_children_before_failure',
  (
    select jsonb_agg(to_jsonb(item) order by item.position)::text
    from public.workout_exercises item
    where item.workout_id = '41000000-0000-0000-0000-000000000041'
  ),
  true
);

create function public.fail_planned_workout_test_child_insert()
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
create trigger fail_planned_workout_test_child_insert
before insert on public.workout_exercises
for each row execute function public.fail_planned_workout_test_child_insert();

set local role authenticated;
select throws_ok(
  $$
    select public.update_planned_workout(
      '41000000-0000-0000-0000-000000000041',
      1,
      jsonb_build_array(jsonb_build_object('exercise_id', (select id from public.exercises where slug = 'front-squat'), 'sets', 77, 'reps', 10))
    )
  $$,
  '23514'::character(5),
  'forced child insert failure',
  'an edit failure rolls back the complete prescription replacement'
);

reset role;
select is(
  (select to_jsonb(workout) from public.workouts workout where id = '41000000-0000-0000-0000-000000000041'),
  current_setting('test.planned_parent_before_failure')::jsonb,
  'failed edit restores parent metadata and revision byte-for-byte'
);
select is(
  (
    select jsonb_agg(to_jsonb(item) order by item.position)
    from public.workout_exercises item
    where item.workout_id = '41000000-0000-0000-0000-000000000041'
  ),
  current_setting('test.planned_children_before_failure')::jsonb,
  'failed edit restores every original child row'
);
drop trigger fail_planned_workout_test_child_insert on public.workout_exercises;
drop function public.fail_planned_workout_test_child_insert();

set local role authenticated;
select is(
  public.update_planned_workout(
    '41000000-0000-0000-0000-000000000041',
    1,
    jsonb_build_array(
      jsonb_build_object('exercise_id', (select id from public.exercises where slug = 'front-squat'), 'sets', 5, 'reps', 5),
      jsonb_build_object('exercise_id', (select id from public.exercises where slug = 'conventional-deadlift'), 'sets', 3, 'reps', 8)
    )
  ),
  2,
  'a complete in-place edit returns the next revision'
);
select is(
  (
    select jsonb_build_object(
      'id', id,
      'user_id', user_id,
      'origin', origin,
      'created_at', created_at,
      'status', status,
      'completed_at', completed_at,
      'revision', revision
    )
    from public.workouts where id = '41000000-0000-0000-0000-000000000041'
  ),
  jsonb_build_object(
    'id', '41000000-0000-0000-0000-000000000041'::uuid,
    'user_id', '00000000-0000-0000-0000-000000000041'::uuid,
    'origin', 'ai'::public.workout_origin,
    'created_at', '2026-09-01 10:00:00+00'::timestamptz,
    'status', 'planned'::public.workout_status,
    'completed_at', null,
    'revision', 2
  ),
  'edit preserves identity, ownership, AI provenance, creation time, and lifecycle state'
);
select is(
  (
    select jsonb_agg(jsonb_build_object('slug', exercise.slug, 'position', item.position, 'sets', item.sets, 'reps', item.reps) order by item.position)
    from public.workout_exercises item
    join public.exercises exercise on exercise.id = item.exercise_id
    where item.workout_id = '41000000-0000-0000-0000-000000000041'
  ),
  '[{"reps": 5, "sets": 5, "slug": "front-squat", "position": 0}, {"reps": 8, "sets": 3, "slug": "conventional-deadlift", "position": 1}]'::jsonb,
  'edit replaces the full prescription with contiguous array-order positions'
);
select throws_ok(
  $$select public.update_planned_workout('41000000-0000-0000-0000-000000000041', 1, jsonb_build_array(jsonb_build_object('exercise_id', (select id from public.exercises where slug = 'back-squat'), 'sets', 3, 'reps', 10)))$$,
  'PW001'::character(5),
  'stale_plan',
  'a stale revision cannot overwrite a newer edit'
);
select throws_ok(
  $$select public.delete_planned_workout('41000000-0000-0000-0000-000000000041', 1)$$,
  'PW001'::character(5),
  'stale_plan',
  'a stale delete changes nothing'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000042', true);
select throws_ok(
  $$select public.update_planned_workout('41000000-0000-0000-0000-000000000041', 2, jsonb_build_array(jsonb_build_object('exercise_id', (select id from public.exercises where slug = 'back-squat'), 'sets', 3, 'reps', 10)))$$,
  'PW001'::character(5),
  'stale_plan',
  'another owner cannot discover or edit a supplied workout ID'
);
select throws_ok(
  $$select public.delete_planned_workout('41000000-0000-0000-0000-000000000041', 2)$$,
  'PW001'::character(5),
  'stale_plan',
  'another owner cannot discover or delete a supplied workout ID'
);
select is(
  public.delete_planned_workout('42000000-0000-0000-0000-000000000042', 1),
  '42000000-0000-0000-0000-000000000042'::uuid,
  'matching delete returns the removed owned workout ID'
);

reset role;
select is(
  (select count(*) from public.workouts where id = '42000000-0000-0000-0000-000000000042'),
  0::bigint,
  'hard delete removes the matching planned parent'
);
select is(
  (select count(*) from public.workout_exercises where workout_id = '42000000-0000-0000-0000-000000000042'),
  0::bigint,
  'hard delete cascades the matching prescription'
);

update public.workouts
set status = 'completed', completed_at = now()
where id = '41000000-0000-0000-0000-000000000041';

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000041', true);
set local role authenticated;
select throws_ok(
  $$select public.update_planned_workout('41000000-0000-0000-0000-000000000041', 2, jsonb_build_array(jsonb_build_object('exercise_id', (select id from public.exercises where slug = 'back-squat'), 'sets', 3, 'reps', 10)))$$,
  'PW001'::character(5),
  'stale_plan',
  'completed history cannot be edited through the planned RPC'
);
select throws_ok(
  $$select public.delete_planned_workout('41000000-0000-0000-0000-000000000041', 2)$$,
  'PW001'::character(5),
  'stale_plan',
  'completed history cannot be deleted through the planned RPC'
);

reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', '', true);
select throws_ok(
  $$select public.update_planned_workout('41000000-0000-0000-0000-000000000041', 2, '[]'::jsonb)$$,
  'PW003'::character(5),
  'unauthenticated',
  'unauthenticated edits use the stable SQLSTATE'
);
select throws_ok(
  $$select public.delete_planned_workout('41000000-0000-0000-0000-000000000041', 2)$$,
  'PW003'::character(5),
  'unauthenticated',
  'unauthenticated deletes use the stable SQLSTATE'
);

select * from finish();
rollback;

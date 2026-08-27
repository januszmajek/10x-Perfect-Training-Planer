begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select no_plan();

select has_table('public', 'workouts', 'workouts table exists');
select has_table('public', 'workout_exercises', 'workout_exercises table exists');

select has_type('public', 'workout_status', 'workout_status enum exists');
select enum_has_labels(
  'public',
  'workout_status',
  array['planned', 'completed'],
  'workout_status has the exact ordered values'
);
select has_type('public', 'workout_origin', 'workout_origin enum exists');
select enum_has_labels(
  'public',
  'workout_origin',
  array['ai', 'manual'],
  'workout_origin has the exact ordered values'
);

select col_is_pk('public', 'workouts', 'id', 'workouts.id is the primary key');
select col_is_pk('public', 'workout_exercises', 'id', 'workout_exercises.id is the primary key');

select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'workouts_user_id_fkey'
      and conrelid = 'public.workouts'::regclass
      and confrelid = 'auth.users'::regclass
      and confupdtype = 'r'
      and confdeltype = 'c'
  ),
  'workouts have the expected cascading auth ownership foreign key'
);
select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'workout_exercises_workout_id_fkey'
      and conrelid = 'public.workout_exercises'::regclass
      and confrelid = 'public.workouts'::regclass
      and confupdtype = 'r'
      and confdeltype = 'c'
  ),
  'workout exercises cascade when a planned parent is deleted'
);
select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'workout_exercises_exercise_id_fkey'
      and conrelid = 'public.workout_exercises'::regclass
      and confrelid = 'public.exercises'::regclass
      and confupdtype = 'r'
      and confdeltype = 'r'
  ),
  'workout exercises restrict catalogue updates and deletes'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'workout_exercises_workout_position_key'
      and conrelid = 'public.workout_exercises'::regclass
      and contype = 'u'
  ),
  'exercise positions are unique within a workout'
);
select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'workout_exercises_workout_exercise_key'
      and conrelid = 'public.workout_exercises'::regclass
      and contype = 'u'
  ),
  'an exercise appears at most once within a workout'
);
select ok(
  exists (
    select 1
    from pg_catalog.pg_index
    where indexrelid = 'public.workouts_one_planned_per_user_idx'::regclass
      and indrelid = 'public.workouts'::regclass
      and indisunique
      and indpred is not null
  ),
  'one planned workout per user is enforced by a partial unique index'
);
select has_index(
  'public',
  'workouts',
  'workouts_user_status_completed_at_idx',
  array['user_id', 'status', 'completed_at']::name[],
  'owned history lookup uses the expected columns'
);
select has_index(
  'public',
  'workout_exercises',
  'workout_exercises_exercise_id_idx',
  array['exercise_id']::name[],
  'catalogue references have a reverse lookup index'
);

select ok(
  (
    select bool_and(relrowsecurity)
    from pg_catalog.pg_class
    where oid in ('public.workouts'::regclass, 'public.workout_exercises'::regclass)
  ),
  'RLS is enabled on both workout tables'
);
select policies_are(
  'public',
  'workouts',
  array[
    'Owners can create planned workouts',
    'Owners can delete planned workouts',
    'Owners can read workouts',
    'Owners can update planned workouts'
  ],
  'workouts have one explicit policy per operation'
);
select policies_are(
  'public',
  'workout_exercises',
  array[
    'Owners can create planned workout exercises',
    'Owners can delete planned workout exercises',
    'Owners can read workout exercises',
    'Owners can update planned workout exercises'
  ],
  'workout exercises have one explicit policy per operation'
);

select ok(
  has_table_privilege('authenticated', 'public.workouts', 'SELECT, DELETE')
    and has_column_privilege('authenticated', 'public.workouts', 'user_id', 'INSERT')
    and has_column_privilege('authenticated', 'public.workouts', 'status', 'INSERT, UPDATE')
    and has_column_privilege('authenticated', 'public.workouts', 'origin', 'INSERT')
    and has_column_privilege('authenticated', 'public.workouts', 'completed_at', 'UPDATE'),
  'authenticated has the intended workout operation and column privileges'
);
select ok(
  not has_column_privilege('authenticated', 'public.workouts', 'id', 'INSERT, UPDATE')
    and not has_column_privilege('authenticated', 'public.workouts', 'user_id', 'UPDATE')
    and not has_column_privilege('authenticated', 'public.workouts', 'origin', 'UPDATE')
    and not has_column_privilege('authenticated', 'public.workouts', 'created_at', 'INSERT, UPDATE')
    and not has_column_privilege('authenticated', 'public.workouts', 'completed_at', 'INSERT'),
  'generated identity, ownership, origin, and timestamps are protected by column privileges'
);
select ok(
  has_table_privilege('authenticated', 'public.workout_exercises', 'SELECT, DELETE')
    and has_column_privilege('authenticated', 'public.workout_exercises', 'workout_id', 'INSERT')
    and has_column_privilege('authenticated', 'public.workout_exercises', 'exercise_id', 'INSERT, UPDATE')
    and has_column_privilege('authenticated', 'public.workout_exercises', 'position', 'INSERT, UPDATE')
    and has_column_privilege('authenticated', 'public.workout_exercises', 'sets', 'INSERT, UPDATE')
    and has_column_privilege('authenticated', 'public.workout_exercises', 'reps', 'INSERT, UPDATE')
    and not has_column_privilege('authenticated', 'public.workout_exercises', 'workout_id', 'UPDATE'),
  'authenticated can edit prescriptions without reparenting workout items'
);
select ok(
  not has_table_privilege('anon', 'public.workouts', 'SELECT, INSERT, UPDATE, DELETE')
    and not has_table_privilege('anon', 'public.workout_exercises', 'SELECT, INSERT, UPDATE, DELETE'),
  'anonymous clients have no workout privileges'
);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000001', 'constraint-one@example.test'),
  ('00000000-0000-0000-0000-000000000002', 'constraint-two@example.test'),
  ('00000000-0000-0000-0000-000000000003', 'owner@example.test'),
  ('00000000-0000-0000-0000-000000000004', 'other@example.test'),
  ('00000000-0000-0000-0000-000000000005', 'state-check@example.test');

insert into public.workouts (id, user_id, status, origin)
values (
  '10000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'planned',
  'manual'
);

select throws_ok(
  $$
    insert into public.workouts (user_id, status, origin)
    values ('00000000-0000-0000-0000-000000000001', 'planned', 'ai')
  $$,
  '23505'::character(5),
  null,
  'a second planned workout fails with SQLSTATE 23505'
);
select lives_ok(
  $$
    insert into public.workouts (id, user_id, status, origin)
    values (
      '20000000-0000-0000-0000-000000000002',
      '00000000-0000-0000-0000-000000000002',
      'planned',
      'ai'
    )
  $$,
  'different users can each have a planned workout'
);
select throws_like(
  $$
    insert into public.workouts (user_id, status, origin, completed_at)
    values ('00000000-0000-0000-0000-000000000005', 'planned', 'manual', now())
  $$,
  '%workouts_status_completed_at_check%',
  'planned workouts reject a completion timestamp'
);
select throws_like(
  $$
    insert into public.workouts (user_id, status, origin)
    values ('00000000-0000-0000-0000-000000000005', 'completed', 'manual')
  $$,
  '%workouts_status_completed_at_check%',
  'completed workouts require a completion timestamp'
);
select throws_like(
  $$
    insert into public.workouts (user_id, status, origin, created_at, completed_at)
    values (
      '00000000-0000-0000-0000-000000000005',
      'completed',
      'manual',
      '2026-01-02 00:00:00+00',
      '2026-01-01 00:00:00+00'
    )
  $$,
  '%workouts_status_completed_at_check%',
  'completion cannot predate workout creation'
);

insert into public.workout_exercises (workout_id, exercise_id, position, sets, reps)
select
  '10000000-0000-0000-0000-000000000001',
  id,
  0,
  3,
  8
from public.exercises
where slug = 'barbell-bench-press';

select throws_like(
  $$
    insert into public.workout_exercises (workout_id, exercise_id, position, sets, reps)
    select '10000000-0000-0000-0000-000000000001', id, 1, 0, 8
    from public.exercises where slug = 'incline-dumbbell-press'
  $$,
  '%workout_exercises_sets_positive_check%',
  'sets must be positive'
);
select throws_like(
  $$
    insert into public.workout_exercises (workout_id, exercise_id, position, sets, reps)
    select '10000000-0000-0000-0000-000000000001', id, 1, 3, 0
    from public.exercises where slug = 'incline-dumbbell-press'
  $$,
  '%workout_exercises_reps_positive_check%',
  'reps must be positive'
);
select throws_like(
  $$
    insert into public.workout_exercises (workout_id, exercise_id, position, sets, reps)
    select '10000000-0000-0000-0000-000000000001', id, -1, 3, 8
    from public.exercises where slug = 'incline-dumbbell-press'
  $$,
  '%workout_exercises_position_non_negative_check%',
  'exercise position must be non-negative'
);
select throws_like(
  $$
    insert into public.workout_exercises (workout_id, exercise_id, position, sets, reps)
    select '10000000-0000-0000-0000-000000000001', id, 0, 3, 8
    from public.exercises where slug = 'incline-dumbbell-press'
  $$,
  '%workout_exercises_workout_position_key%',
  'exercise positions cannot repeat within a workout'
);
select throws_like(
  $$
    insert into public.workout_exercises (workout_id, exercise_id, position, sets, reps)
    select '10000000-0000-0000-0000-000000000001', id, 1, 3, 8
    from public.exercises where slug = 'barbell-bench-press'
  $$,
  '%workout_exercises_workout_exercise_key%',
  'the same exercise cannot repeat within a workout'
);
select throws_like(
  $$
    insert into public.workout_exercises (workout_id, exercise_id, position, sets, reps)
    values (
      '10000000-0000-0000-0000-000000000001',
      'ffffffff-ffff-ffff-ffff-ffffffffffff',
      1,
      3,
      8
    )
  $$,
  '%workout_exercises_exercise_id_fkey%',
  'workout prescriptions must reference the canonical catalogue'
);

insert into public.workouts (id, user_id, status, origin)
values (
  '40000000-0000-0000-0000-000000000004',
  '00000000-0000-0000-0000-000000000004',
  'planned',
  'manual'
);
insert into public.workout_exercises (workout_id, exercise_id, position, sets, reps)
select
  '40000000-0000-0000-0000-000000000004',
  id,
  0,
  4,
  6
from public.exercises
where slug = 'back-squat';

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select lives_ok(
  $$
    insert into public.workouts (user_id, status, origin)
    values ('00000000-0000-0000-0000-000000000003', 'planned', 'ai')
  $$,
  'an authenticated owner can create a planned workout'
);
select throws_ok(
  $$
    insert into public.workouts (user_id, status, origin)
    values ('00000000-0000-0000-0000-000000000003', 'planned', 'manual')
  $$,
  '23505'::character(5),
  null,
  'the owner also receives SQLSTATE 23505 for a second plan'
);
select throws_like(
  $$
    insert into public.workouts (user_id, status, origin)
    values ('00000000-0000-0000-0000-000000000004', 'planned', 'manual')
  $$,
  '%row-level security policy for table "workouts"%',
  'an owner cannot create a workout for another user'
);
select is(
  (select count(*) from public.workouts where user_id = '00000000-0000-0000-0000-000000000003'),
  1::bigint,
  'an owner can read their own workout'
);
select is(
  (select count(*) from public.workouts where user_id = '00000000-0000-0000-0000-000000000004'),
  0::bigint,
  'another user workout is hidden by RLS'
);

select lives_ok(
  $$
    insert into public.workout_exercises (workout_id, exercise_id, position, sets, reps)
    select workout.id, exercise.id, 0, 3, 10
    from public.workouts workout
    cross join public.exercises exercise
    where workout.user_id = '00000000-0000-0000-0000-000000000003'
      and workout.status = 'planned'
      and exercise.slug = 'barbell-bench-press'
  $$,
  'an owner can add an exercise to their planned workout'
);
select is(
  (select count(*) from public.workout_exercises),
  1::bigint,
  'an owner sees their own workout exercises'
);
select is(
  (
    select count(*)
    from public.workout_exercises
    where workout_id = '40000000-0000-0000-0000-000000000004'
  ),
  0::bigint,
  'another user workout exercises are hidden by RLS'
);
select throws_like(
  $$
    insert into public.workout_exercises (workout_id, exercise_id, position, sets, reps)
    select '40000000-0000-0000-0000-000000000004', id, 1, 3, 10
    from public.exercises where slug = 'front-squat'
  $$,
  '%row-level security policy for table "workout_exercises"%',
  'an owner cannot add an exercise to another user workout'
);
select lives_ok(
  $$update public.workout_exercises set sets = 4, reps = 8$$,
  'an owner can edit prescriptions in their planned workout'
);
select is(
  (select count(*) from public.workout_exercises where sets = 4 and reps = 8),
  1::bigint,
  'the owner prescription update is persisted'
);
select lives_ok(
  $$
    update public.workout_exercises
    set sets = 5
    where workout_id = '40000000-0000-0000-0000-000000000004'
  $$,
  'an attempted cross-user exercise update changes no visible row'
);
select lives_ok(
  $$
    delete from public.workout_exercises
    where workout_id = '40000000-0000-0000-0000-000000000004'
  $$,
  'an attempted cross-user exercise delete changes no visible row'
);
select throws_like(
  $$
    update public.workouts
    set user_id = '00000000-0000-0000-0000-000000000004'
    where user_id = '00000000-0000-0000-0000-000000000003'
  $$,
  '%permission denied for table workouts%',
  'workout ownership cannot be reassigned'
);
select throws_like(
  $$
    update public.workouts
    set origin = 'manual'
    where user_id = '00000000-0000-0000-0000-000000000003'
  $$,
  '%permission denied for table workouts%',
  'workout origin is immutable'
);
select throws_like(
  $$
    update public.workouts
    set created_at = now()
    where user_id = '00000000-0000-0000-0000-000000000003'
  $$,
  '%permission denied for table workouts%',
  'workout creation time is immutable'
);
select throws_like(
  $$
    update public.workout_exercises
    set workout_id = '40000000-0000-0000-0000-000000000004'
  $$,
  '%permission denied for table workout_exercises%',
  'workout exercises cannot be reparented'
);
select lives_ok(
  $$
    update public.workouts
    set status = 'completed', completed_at = now()
    where user_id = '00000000-0000-0000-0000-000000000003'
      and status = 'planned'
  $$,
  'an owner can atomically complete their planned workout'
);
select is(
  (
    select count(*)
    from public.workouts
    where user_id = '00000000-0000-0000-0000-000000000003'
      and status = 'completed'
      and completed_at is not null
  ),
  1::bigint,
  'the completed workout becomes readable history'
);
select lives_ok(
  $$update public.workout_exercises set sets = 5$$,
  'an attempted completed-exercise update changes no row'
);
select is(
  (select count(*) from public.workout_exercises where sets = 4 and reps = 8),
  1::bigint,
  'completed workout exercises are immutable'
);
select lives_ok(
  $$delete from public.workout_exercises$$,
  'an attempted completed-exercise delete changes no row'
);
select is(
  (select count(*) from public.workout_exercises),
  1::bigint,
  'completed workout exercises cannot be deleted'
);
select throws_like(
  $$
    insert into public.workout_exercises (workout_id, exercise_id, position, sets, reps)
    select workout.id, exercise.id, 1, 3, 10
    from public.workouts workout
    cross join public.exercises exercise
    where workout.user_id = '00000000-0000-0000-0000-000000000003'
      and workout.status = 'completed'
      and exercise.slug = 'incline-dumbbell-press'
  $$,
  '%row-level security policy for table "workout_exercises"%',
  'new exercises cannot be added to completed history'
);
select lives_ok(
  $$
    update public.workouts
    set status = 'planned', completed_at = null
    where user_id = '00000000-0000-0000-0000-000000000003'
      and status = 'completed'
  $$,
  'an attempted completed-workout reversion changes no row'
);
select is(
  (
    select count(*)
    from public.workouts
    where user_id = '00000000-0000-0000-0000-000000000003'
      and status = 'completed'
      and completed_at is not null
  ),
  1::bigint,
  'a completed workout cannot return to planned state'
);
select lives_ok(
  $$
    delete from public.workouts
    where user_id = '00000000-0000-0000-0000-000000000003'
      and status = 'completed'
  $$,
  'an attempted completed-workout delete changes no row'
);
select is(
  (
    select count(*)
    from public.workouts
    where user_id = '00000000-0000-0000-0000-000000000003'
      and status = 'completed'
  ),
  1::bigint,
  'completed workout history cannot be deleted'
);
select lives_ok(
  $$
    update public.workouts
    set status = 'completed', completed_at = now()
    where user_id = '00000000-0000-0000-0000-000000000004'
  $$,
  'an attempted cross-user workout update changes no visible row'
);
select lives_ok(
  $$
    delete from public.workouts
    where user_id = '00000000-0000-0000-0000-000000000004'
  $$,
  'an attempted cross-user workout delete changes no visible row'
);
select lives_ok(
  $$
    insert into public.workouts (user_id, status, origin)
    values ('00000000-0000-0000-0000-000000000003', 'planned', 'manual')
  $$,
  'completion frees the single planned-workout slot'
);
select lives_ok(
  $$
    insert into public.workout_exercises (workout_id, exercise_id, position, sets, reps)
    select workout.id, exercise.id, 0, 3, 12
    from public.workouts workout
    cross join public.exercises exercise
    where workout.user_id = '00000000-0000-0000-0000-000000000003'
      and workout.status = 'planned'
      and exercise.slug = 'incline-dumbbell-press'
  $$,
  'the next planned workout can receive its own exercises'
);
select lives_ok(
  $$
    delete from public.workouts
    where user_id = '00000000-0000-0000-0000-000000000003'
      and status = 'planned'
  $$,
  'an owner can delete their planned workout'
);
select is(
  (
    select count(*)
    from public.workouts
    where user_id = '00000000-0000-0000-0000-000000000003'
      and status = 'planned'
  ),
  0::bigint,
  'the planned workout is removed'
);
select is(
  (select count(*) from public.workout_exercises),
  1::bigint,
  'deleting a planned workout cascades only its exercises'
);

reset role;

select is(
  (
    select count(*)
    from public.workouts
    where id = '40000000-0000-0000-0000-000000000004'
      and status = 'planned'
  ),
  1::bigint,
  'cross-user update and delete attempts leave the other workout unchanged'
);
select is(
  (
    select count(*)
    from public.workout_exercises
    where workout_id = '40000000-0000-0000-0000-000000000004'
      and sets = 4
      and reps = 6
  ),
  1::bigint,
  'cross-user item update and delete attempts leave the other prescription unchanged'
);

select * from finish();
rollback;

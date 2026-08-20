begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(40);

select has_table('public', 'muscle_groups', 'muscle_groups table exists');
select has_table('public', 'exercises', 'exercises table exists');
select has_table('public', 'exercise_muscle_groups', 'exercise_muscle_groups table exists');

select has_type('public', 'muscle_category', 'muscle_category enum exists');
select enum_has_labels(
  'public',
  'muscle_category',
  array['upper_body', 'lower_body', 'core'],
  'muscle_category has the exact ordered values'
);
select has_type('public', 'equipment_type', 'equipment_type enum exists');
select enum_has_labels(
  'public',
  'equipment_type',
  array['barbell', 'dumbbell', 'cable', 'machine', 'bodyweight', 'kettlebell', 'resistance_band'],
  'equipment_type has the exact ordered values'
);
select has_type('public', 'exercise_muscle_role', 'exercise_muscle_role enum exists');
select enum_has_labels(
  'public',
  'exercise_muscle_role',
  array['primary', 'secondary'],
  'exercise_muscle_role has the exact ordered values'
);

select col_is_pk('public', 'muscle_groups', 'code', 'muscle_groups.code is the primary key');
select col_is_pk('public', 'exercises', 'id', 'exercises.id is the primary key');
select col_is_pk(
  'public',
  'exercise_muscle_groups',
  array['exercise_id', 'muscle_group_code', 'role'],
  'exercise muscle tags use the expected composite primary key'
);
select col_is_unique('public', 'exercises', 'slug', 'exercise slugs are unique');
select col_is_unique('public', 'exercises', 'name', 'exercise names are unique');

select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'exercise_muscle_groups_exercise_id_fkey'
      and conrelid = 'public.exercise_muscle_groups'::regclass
      and confrelid = 'public.exercises'::regclass
      and confupdtype = 'r'
      and confdeltype = 'r'
  ),
  'exercise tags restrict exercise updates and deletes'
);
select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'exercise_muscle_groups_muscle_group_code_fkey'
      and conrelid = 'public.exercise_muscle_groups'::regclass
      and confrelid = 'public.muscle_groups'::regclass
      and confupdtype = 'r'
      and confdeltype = 'r'
  ),
  'exercise tags restrict muscle-group updates and deletes'
);
select has_index(
  'public',
  'exercise_muscle_groups',
  'exercise_muscle_groups_muscle_lookup_idx',
  array['muscle_group_code', 'role', 'exercise_id']::name[],
  'reverse muscle lookup index uses the expected column order'
);

select ok(
  (
    select bool_and(relrowsecurity)
    from pg_catalog.pg_class
    where oid in (
      'public.muscle_groups'::regclass,
      'public.exercises'::regclass,
      'public.exercise_muscle_groups'::regclass
    )
  ),
  'RLS is enabled on every catalogue table'
);
select policies_are(
  'public',
  'muscle_groups',
  array['Authenticated users can read muscle groups'],
  'muscle_groups exposes only its authenticated read policy'
);
select policies_are(
  'public',
  'exercises',
  array['Authenticated users can read exercises'],
  'exercises exposes only its authenticated read policy'
);
select policies_are(
  'public',
  'exercise_muscle_groups',
  array['Authenticated users can read exercise muscle groups'],
  'exercise_muscle_groups exposes only its authenticated read policy'
);

select is((select count(*) from public.muscle_groups), 16::bigint, 'the taxonomy contains exactly 16 muscle groups');
select is(
  (
    select count(*)
    from (
      values
        ('adductors', 'Adductors', 'lower_body'::public.muscle_category, 72),
        ('biceps', 'Biceps', 'upper_body'::public.muscle_category, 48),
        ('calves', 'Calves', 'lower_body'::public.muscle_category, 72),
        ('chest', 'Chest', 'upper_body'::public.muscle_category, 48),
        ('core', 'Core', 'core'::public.muscle_category, 48),
        ('forearms', 'Forearms', 'upper_body'::public.muscle_category, 48),
        ('front_delts', 'Front Delts', 'upper_body'::public.muscle_category, 48),
        ('glutes', 'Glutes', 'lower_body'::public.muscle_category, 72),
        ('hamstrings', 'Hamstrings', 'lower_body'::public.muscle_category, 72),
        ('lats', 'Lats', 'upper_body'::public.muscle_category, 72),
        ('lower_back', 'Lower Back', 'upper_body'::public.muscle_category, 72),
        ('quads', 'Quads', 'lower_body'::public.muscle_category, 72),
        ('rear_delts', 'Rear Delts', 'upper_body'::public.muscle_category, 48),
        ('side_delts', 'Side Delts', 'upper_body'::public.muscle_category, 48),
        ('triceps', 'Triceps', 'upper_body'::public.muscle_category, 48),
        ('upper_back', 'Upper Back', 'upper_body'::public.muscle_category, 72)
    ) as expected(code, name, category, recovery_hours)
    left join public.muscle_groups actual using (code)
    where actual.code is null
      or actual.name <> expected.name
      or actual.category <> expected.category
      or actual.recovery_hours <> expected.recovery_hours
  ),
  0::bigint,
  'taxonomy categories and recovery windows match the canonical mapping'
);

select ok(
  (select count(*) between 50 and 60 from public.exercises),
  'the production catalogue contains between 50 and 60 exercises'
);
select is(
  (
    select count(*)
    from public.exercises exercise
    where not exists (
      select 1
      from public.exercise_muscle_groups tag
      where tag.exercise_id = exercise.id
        and tag.role = 'primary'
    )
  ),
  0::bigint,
  'every exercise has at least one primary muscle tag'
);
select is(
  (
    select count(*)
    from public.muscle_groups muscle_group
    where (
      select count(distinct tag.exercise_id)
      from public.exercise_muscle_groups tag
      where tag.muscle_group_code = muscle_group.code
        and tag.role = 'primary'
    ) < 3
  ),
  0::bigint,
  'every muscle group has at least three primary-tagged exercises'
);
select ok(
  exists (
    select 1
    from public.exercise_muscle_groups
    where role = 'primary'
    group by exercise_id
    having count(*) > 1
  ),
  'the catalogue supports exercises with several primary muscle groups'
);
select throws_like(
  $$
    insert into public.exercise_muscle_groups (exercise_id, muscle_group_code, role)
    select id, 'chest', 'primary'
    from public.exercises
    where slug = 'barbell-bench-press'
  $$,
  '%duplicate key value violates unique constraint%',
  'duplicate exercise muscle tags are rejected'
);
select is(
  (select count(*) from public.exercises where slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  0::bigint,
  'every catalogue slug is stable kebab-case'
);
select is(
  (select count(distinct equipment) from public.exercises),
  7::bigint,
  'the catalogue represents every equipment value'
);
select is(
  (
    select array_agg(tag.muscle_group_code order by tag.muscle_group_code)
    from public.exercises exercise
    join public.exercise_muscle_groups tag on tag.exercise_id = exercise.id
    where exercise.slug = 'barbell-bench-press'
      and tag.role = 'primary'
  ),
  array['chest']::text[],
  'barbell bench press has chest as its primary group'
);
select is(
  (
    select array_agg(tag.muscle_group_code order by tag.muscle_group_code)
    from public.exercises exercise
    join public.exercise_muscle_groups tag on tag.exercise_id = exercise.id
    where exercise.slug = 'barbell-bench-press'
      and tag.role = 'secondary'
  ),
  array['front_delts', 'triceps']::text[],
  'barbell bench press has the canonical secondary groups'
);
select is(
  (select count(*) from public.exercises where name ilike '%smith%' and equipment <> 'machine'),
  0::bigint,
  'Smith-machine exercises use machine equipment when present'
);

select ok(
  has_table_privilege('authenticated', 'public.muscle_groups', 'SELECT')
    and has_table_privilege('authenticated', 'public.exercises', 'SELECT')
    and has_table_privilege('authenticated', 'public.exercise_muscle_groups', 'SELECT'),
  'authenticated has SELECT privilege on every catalogue table'
);
select ok(
  not has_table_privilege('authenticated', 'public.muscle_groups', 'INSERT, UPDATE, DELETE')
    and not has_table_privilege('authenticated', 'public.exercises', 'INSERT, UPDATE, DELETE')
    and not has_table_privilege('authenticated', 'public.exercise_muscle_groups', 'INSERT, UPDATE, DELETE'),
  'authenticated has no catalogue mutation privileges'
);
select ok(
  not has_table_privilege('anon', 'public.muscle_groups', 'SELECT')
    and not has_table_privilege('anon', 'public.exercises', 'SELECT')
    and not has_table_privilege('anon', 'public.exercise_muscle_groups', 'SELECT'),
  'anonymous clients have no catalogue read privileges'
);

set local role authenticated;

select is(
  (select count(*) from public.exercises),
  58::bigint,
  'an authenticated client can read the complete catalogue through RLS'
);
select throws_like(
  $$insert into public.exercises (slug, name, equipment) values ('forbidden', 'Forbidden', 'bodyweight')$$,
  '%permission denied for table exercises%',
  'an authenticated client cannot insert exercises'
);
select throws_like(
  $$update public.muscle_groups set name = name where code = 'chest'$$,
  '%permission denied for table muscle_groups%',
  'an authenticated client cannot update muscle groups'
);
select throws_like(
  $$delete from public.exercise_muscle_groups where false$$,
  '%permission denied for table exercise_muscle_groups%',
  'an authenticated client cannot delete exercise tags'
);

reset role;

select * from finish();
rollback;

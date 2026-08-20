create type public.muscle_category as enum ('upper_body', 'lower_body', 'core');

create type public.equipment_type as enum (
  'barbell',
  'dumbbell',
  'cable',
  'machine',
  'bodyweight',
  'kettlebell',
  'resistance_band'
);

create type public.exercise_muscle_role as enum ('primary', 'secondary');

create table public.muscle_groups (
  code text primary key,
  name text not null unique,
  category public.muscle_category not null,
  recovery_hours integer not null,
  constraint muscle_groups_code_format_check check (code ~ '^[a-z]+(?:_[a-z]+)*$'),
  constraint muscle_groups_name_not_blank_check check (btrim(name) <> ''),
  constraint muscle_groups_recovery_hours_positive_check check (recovery_hours > 0)
);

create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null unique,
  equipment public.equipment_type not null,
  constraint exercises_slug_format_check check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint exercises_name_not_blank_check check (btrim(name) <> '')
);

create table public.exercise_muscle_groups (
  exercise_id uuid not null,
  muscle_group_code text not null,
  role public.exercise_muscle_role not null,
  primary key (exercise_id, muscle_group_code, role),
  constraint exercise_muscle_groups_exercise_id_fkey foreign key (exercise_id)
    references public.exercises (id)
    on update restrict
    on delete restrict,
  constraint exercise_muscle_groups_muscle_group_code_fkey foreign key (muscle_group_code)
    references public.muscle_groups (code)
    on update restrict
    on delete restrict
);

create index exercise_muscle_groups_muscle_lookup_idx
  on public.exercise_muscle_groups (muscle_group_code, role, exercise_id);

insert into public.muscle_groups (code, name, category, recovery_hours)
values
  ('chest', 'Chest', 'upper_body', 48),
  ('lats', 'Lats', 'upper_body', 72),
  ('upper_back', 'Upper Back', 'upper_body', 72),
  ('lower_back', 'Lower Back', 'upper_body', 72),
  ('front_delts', 'Front Delts', 'upper_body', 48),
  ('side_delts', 'Side Delts', 'upper_body', 48),
  ('rear_delts', 'Rear Delts', 'upper_body', 48),
  ('biceps', 'Biceps', 'upper_body', 48),
  ('triceps', 'Triceps', 'upper_body', 48),
  ('forearms', 'Forearms', 'upper_body', 48),
  ('quads', 'Quads', 'lower_body', 72),
  ('hamstrings', 'Hamstrings', 'lower_body', 72),
  ('glutes', 'Glutes', 'lower_body', 72),
  ('calves', 'Calves', 'lower_body', 72),
  ('adductors', 'Adductors', 'lower_body', 72),
  ('core', 'Core', 'core', 48);

alter table public.muscle_groups enable row level security;
alter table public.exercises enable row level security;
alter table public.exercise_muscle_groups enable row level security;

create policy "Authenticated users can read muscle groups"
  on public.muscle_groups
  for select
  to authenticated
  using (true);

create policy "Authenticated users can read exercises"
  on public.exercises
  for select
  to authenticated
  using (true);

create policy "Authenticated users can read exercise muscle groups"
  on public.exercise_muscle_groups
  for select
  to authenticated
  using (true);

revoke all on table public.muscle_groups from anon, authenticated;
revoke all on table public.exercises from anon, authenticated;
revoke all on table public.exercise_muscle_groups from anon, authenticated;

grant select on table public.muscle_groups to authenticated;
grant select on table public.exercises to authenticated;
grant select on table public.exercise_muscle_groups to authenticated;

grant all on table public.muscle_groups to service_role;
grant all on table public.exercises to service_role;
grant all on table public.exercise_muscle_groups to service_role;

revoke all on type public.muscle_category from public, anon, authenticated;
revoke all on type public.equipment_type from public, anon, authenticated;
revoke all on type public.exercise_muscle_role from public, anon, authenticated;

grant usage on type public.muscle_category to authenticated, service_role;
grant usage on type public.equipment_type to authenticated, service_role;
grant usage on type public.exercise_muscle_role to authenticated, service_role;

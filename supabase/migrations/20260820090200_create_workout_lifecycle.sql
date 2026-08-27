create type public.workout_status as enum ('planned', 'completed');

create type public.workout_origin as enum ('ai', 'manual');

create table public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  status public.workout_status not null default 'planned',
  origin public.workout_origin not null,
  created_at timestamp with time zone not null default now(),
  completed_at timestamp with time zone,
  constraint workouts_user_id_fkey foreign key (user_id)
    references auth.users (id)
    on update restrict
    on delete cascade,
  constraint workouts_status_completed_at_check check (
    (status = 'planned' and completed_at is null)
    or (
      status = 'completed'
      and completed_at is not null
      and completed_at >= created_at
    )
  )
);

create table public.workout_exercises (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null,
  exercise_id uuid not null,
  position integer not null,
  sets integer not null,
  reps integer not null,
  constraint workout_exercises_workout_id_fkey foreign key (workout_id)
    references public.workouts (id)
    on update restrict
    on delete cascade,
  constraint workout_exercises_exercise_id_fkey foreign key (exercise_id)
    references public.exercises (id)
    on update restrict
    on delete restrict,
  constraint workout_exercises_position_non_negative_check check (position >= 0),
  constraint workout_exercises_sets_positive_check check (sets > 0),
  constraint workout_exercises_reps_positive_check check (reps > 0),
  constraint workout_exercises_workout_position_key unique (workout_id, position),
  constraint workout_exercises_workout_exercise_key unique (workout_id, exercise_id)
);

create unique index workouts_one_planned_per_user_idx
  on public.workouts (user_id)
  where status = 'planned';

create index workouts_user_status_completed_at_idx
  on public.workouts (user_id, status, completed_at desc);

create index workout_exercises_exercise_id_idx
  on public.workout_exercises (exercise_id);

alter table public.workouts enable row level security;
alter table public.workout_exercises enable row level security;

create policy "Owners can read workouts"
  on public.workouts
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Owners can create planned workouts"
  on public.workouts
  for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and status = 'planned'
    and completed_at is null
  );

create policy "Owners can update planned workouts"
  on public.workouts
  for update
  to authenticated
  using (
    (select auth.uid()) = user_id
    and status = 'planned'
  )
  with check (
    (select auth.uid()) = user_id
    and status in ('planned', 'completed')
  );

create policy "Owners can delete planned workouts"
  on public.workouts
  for delete
  to authenticated
  using (
    (select auth.uid()) = user_id
    and status = 'planned'
  );

create policy "Owners can read workout exercises"
  on public.workout_exercises
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.workouts
      where workouts.id = workout_exercises.workout_id
        and workouts.user_id = (select auth.uid())
    )
  );

create policy "Owners can create planned workout exercises"
  on public.workout_exercises
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.workouts
      where workouts.id = workout_exercises.workout_id
        and workouts.user_id = (select auth.uid())
        and workouts.status = 'planned'
    )
  );

create policy "Owners can update planned workout exercises"
  on public.workout_exercises
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.workouts
      where workouts.id = workout_exercises.workout_id
        and workouts.user_id = (select auth.uid())
        and workouts.status = 'planned'
    )
  )
  with check (
    exists (
      select 1
      from public.workouts
      where workouts.id = workout_exercises.workout_id
        and workouts.user_id = (select auth.uid())
        and workouts.status = 'planned'
    )
  );

create policy "Owners can delete planned workout exercises"
  on public.workout_exercises
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.workouts
      where workouts.id = workout_exercises.workout_id
        and workouts.user_id = (select auth.uid())
        and workouts.status = 'planned'
    )
  );

revoke all on table public.workouts from anon, authenticated;
revoke all on table public.workout_exercises from anon, authenticated;

grant select, delete on table public.workouts to authenticated;
grant insert (user_id, status, origin) on table public.workouts to authenticated;
grant update (status, completed_at) on table public.workouts to authenticated;

grant select, delete on table public.workout_exercises to authenticated;
grant insert (workout_id, exercise_id, position, sets, reps)
  on table public.workout_exercises to authenticated;
grant update (exercise_id, position, sets, reps)
  on table public.workout_exercises to authenticated;

grant all on table public.workouts to service_role;
grant all on table public.workout_exercises to service_role;

revoke all on type public.workout_status from public, anon, authenticated;
revoke all on type public.workout_origin from public, anon, authenticated;

grant usage on type public.workout_status to authenticated, service_role;
grant usage on type public.workout_origin to authenticated, service_role;

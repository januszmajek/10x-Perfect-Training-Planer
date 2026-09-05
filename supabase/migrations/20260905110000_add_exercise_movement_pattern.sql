create type public.exercise_movement_pattern as enum ('push', 'pull');

alter table public.exercises
  add column movement_pattern public.exercise_movement_pattern;

update public.exercises
set movement_pattern = 'push'
where slug in (
  'barbell-bench-press',
  'incline-dumbbell-press',
  'push-up',
  'machine-chest-press',
  'parallel-bar-dip',
  'overhead-barbell-press',
  'seated-dumbbell-shoulder-press',
  'landmine-press',
  'close-grip-bench-press'
);

update public.exercises
set movement_pattern = 'pull'
where slug in (
  'pull-up',
  'lat-pulldown',
  'one-arm-dumbbell-row',
  'straight-arm-pulldown',
  'seated-cable-row',
  'chest-supported-dumbbell-row',
  'barbell-bent-over-row',
  'inverted-row'
);

revoke all on type public.exercise_movement_pattern from public, anon, authenticated;
grant usage on type public.exercise_movement_pattern to authenticated, service_role;

-- Active: 1785222341219@@127.0.0.1@5432
with catalogue (slug, name, equipment, primary_muscles, secondary_muscles) as (
  values
    (
      'barbell-bench-press',
      'Barbell Bench Press',
      'barbell'::public.equipment_type,
      array['chest'],
      array['front_delts', 'triceps']
    ),
    (
      'incline-dumbbell-press',
      'Incline Dumbbell Press',
      'dumbbell'::public.equipment_type,
      array['chest'],
      array['front_delts', 'triceps']
    ),
    (
      'cable-chest-fly',
      'Cable Chest Fly',
      'cable'::public.equipment_type,
      array['chest'],
      array['front_delts']
    ),
    (
      'push-up',
      'Push-Up',
      'bodyweight'::public.equipment_type,
      array['chest'],
      array['front_delts', 'triceps', 'core']
    ),
    (
      'machine-chest-press',
      'Machine Chest Press',
      'machine'::public.equipment_type,
      array['chest'],
      array['front_delts', 'triceps']
    ),
    (
      'parallel-bar-dip',
      'Parallel Bar Dip',
      'bodyweight'::public.equipment_type,
      array['chest', 'triceps'],
      array['front_delts']
    ),
    (
      'pull-up',
      'Pull-Up',
      'bodyweight'::public.equipment_type,
      array['lats'],
      array['biceps', 'forearms']
    ),
    (
      'lat-pulldown',
      'Lat Pulldown',
      'cable'::public.equipment_type,
      array['lats'],
      array['biceps', 'rear_delts']
    ),
    (
      'one-arm-dumbbell-row',
      'One-Arm Dumbbell Row',
      'dumbbell'::public.equipment_type,
      array['lats', 'upper_back'],
      array['biceps', 'rear_delts', 'forearms']
    ),
    (
      'straight-arm-pulldown',
      'Straight-Arm Pulldown',
      'cable'::public.equipment_type,
      array['lats'],
      array[]::text[]
    ),
    (
      'seated-cable-row',
      'Seated Cable Row',
      'cable'::public.equipment_type,
      array['lats', 'upper_back'],
      array['biceps', 'rear_delts']
    ),
    (
      'chest-supported-dumbbell-row',
      'Chest-Supported Dumbbell Row',
      'dumbbell'::public.equipment_type,
      array['upper_back', 'lats'],
      array['biceps', 'rear_delts']
    ),
    (
      'barbell-bent-over-row',
      'Barbell Bent-Over Row',
      'barbell'::public.equipment_type,
      array['upper_back', 'lats'],
      array['biceps', 'rear_delts', 'lower_back']
    ),
    (
      'inverted-row',
      'Inverted Row',
      'bodyweight'::public.equipment_type,
      array['upper_back', 'lats'],
      array['biceps', 'rear_delts', 'core']
    ),
    (
      'conventional-deadlift',
      'Conventional Deadlift',
      'barbell'::public.equipment_type,
      array['glutes', 'hamstrings', 'lower_back'],
      array['quads', 'upper_back', 'forearms', 'core']
    ),
    (
      'romanian-deadlift',
      'Romanian Deadlift',
      'barbell'::public.equipment_type,
      array['hamstrings', 'glutes', 'lower_back'],
      array['forearms']
    ),
    (
      'back-extension',
      'Back Extension',
      'bodyweight'::public.equipment_type,
      array['lower_back', 'glutes'],
      array['hamstrings']
    ),
    (
      'overhead-barbell-press',
      'Overhead Barbell Press',
      'barbell'::public.equipment_type,
      array['front_delts', 'side_delts'],
      array['triceps', 'core']
    ),
    (
      'seated-dumbbell-shoulder-press',
      'Seated Dumbbell Shoulder Press',
      'dumbbell'::public.equipment_type,
      array['front_delts', 'side_delts'],
      array['triceps']
    ),
    (
      'landmine-press',
      'Landmine Press',
      'barbell'::public.equipment_type,
      array['front_delts'],
      array['chest', 'triceps']
    ),
    (
      'dumbbell-lateral-raise',
      'Dumbbell Lateral Raise',
      'dumbbell'::public.equipment_type,
      array['side_delts'],
      array[]::text[]
    ),
    (
      'cable-lateral-raise',
      'Cable Lateral Raise',
      'cable'::public.equipment_type,
      array['side_delts'],
      array[]::text[]
    ),
    (
      'machine-lateral-raise',
      'Machine Lateral Raise',
      'machine'::public.equipment_type,
      array['side_delts'],
      array[]::text[]
    ),
    (
      'reverse-pec-deck',
      'Reverse Pec Deck',
      'machine'::public.equipment_type,
      array['rear_delts'],
      array['upper_back']
    ),
    (
      'face-pull',
      'Face Pull',
      'cable'::public.equipment_type,
      array['rear_delts', 'upper_back'],
      array['biceps']
    ),
    (
      'bent-over-dumbbell-reverse-fly',
      'Bent-Over Dumbbell Reverse Fly',
      'dumbbell'::public.equipment_type,
      array['rear_delts'],
      array['upper_back']
    ),
    (
      'barbell-curl',
      'Barbell Curl',
      'barbell'::public.equipment_type,
      array['biceps'],
      array['forearms']
    ),
    (
      'incline-dumbbell-curl',
      'Incline Dumbbell Curl',
      'dumbbell'::public.equipment_type,
      array['biceps'],
      array['forearms']
    ),
    (
      'cable-curl',
      'Cable Curl',
      'cable'::public.equipment_type,
      array['biceps'],
      array['forearms']
    ),
    (
      'hammer-curl',
      'Hammer Curl',
      'dumbbell'::public.equipment_type,
      array['biceps', 'forearms'],
      array[]::text[]
    ),
    (
      'cable-triceps-pushdown',
      'Cable Triceps Pushdown',
      'cable'::public.equipment_type,
      array['triceps'],
      array[]::text[]
    ),
    (
      'overhead-dumbbell-triceps-extension',
      'Overhead Dumbbell Triceps Extension',
      'dumbbell'::public.equipment_type,
      array['triceps'],
      array[]::text[]
    ),
    (
      'close-grip-bench-press',
      'Close-Grip Bench Press',
      'barbell'::public.equipment_type,
      array['triceps', 'chest'],
      array['front_delts']
    ),
    (
      'wrist-curl',
      'Wrist Curl',
      'barbell'::public.equipment_type,
      array['forearms'],
      array[]::text[]
    ),
    (
      'reverse-wrist-curl',
      'Reverse Wrist Curl',
      'barbell'::public.equipment_type,
      array['forearms'],
      array[]::text[]
    ),
    (
      'farmers-carry',
      'Farmer''s Carry',
      'dumbbell'::public.equipment_type,
      array['forearms', 'core'],
      array['upper_back']
    ),
    (
      'back-squat',
      'Back Squat',
      'barbell'::public.equipment_type,
      array['quads', 'glutes'],
      array['hamstrings', 'adductors', 'core', 'lower_back']
    ),
    (
      'front-squat',
      'Front Squat',
      'barbell'::public.equipment_type,
      array['quads'],
      array['glutes', 'core', 'upper_back']
    ),
    (
      'leg-press',
      'Leg Press',
      'machine'::public.equipment_type,
      array['quads', 'glutes'],
      array['hamstrings', 'adductors']
    ),
    (
      'leg-extension',
      'Leg Extension',
      'machine'::public.equipment_type,
      array['quads'],
      array[]::text[]
    ),
    (
      'bulgarian-split-squat',
      'Bulgarian Split Squat',
      'dumbbell'::public.equipment_type,
      array['quads', 'glutes'],
      array['hamstrings', 'adductors', 'core']
    ),
    (
      'lying-leg-curl',
      'Lying Leg Curl',
      'machine'::public.equipment_type,
      array['hamstrings'],
      array['calves']
    ),
    (
      'seated-leg-curl',
      'Seated Leg Curl',
      'machine'::public.equipment_type,
      array['hamstrings'],
      array['calves']
    ),
    (
      'barbell-hip-thrust',
      'Barbell Hip Thrust',
      'barbell'::public.equipment_type,
      array['glutes'],
      array['hamstrings', 'core']
    ),
    (
      'cable-pull-through',
      'Cable Pull-Through',
      'cable'::public.equipment_type,
      array['glutes', 'hamstrings'],
      array['lower_back']
    ),
    (
      'standing-calf-raise',
      'Standing Calf Raise',
      'machine'::public.equipment_type,
      array['calves'],
      array[]::text[]
    ),
    (
      'seated-calf-raise',
      'Seated Calf Raise',
      'machine'::public.equipment_type,
      array['calves'],
      array[]::text[]
    ),
    (
      'leg-press-calf-raise',
      'Leg Press Calf Raise',
      'machine'::public.equipment_type,
      array['calves'],
      array[]::text[]
    ),
    (
      'machine-hip-adduction',
      'Machine Hip Adduction',
      'machine'::public.equipment_type,
      array['adductors'],
      array[]::text[]
    ),
    (
      'copenhagen-plank',
      'Copenhagen Plank',
      'bodyweight'::public.equipment_type,
      array['adductors', 'core'],
      array['glutes']
    ),
    (
      'sumo-deadlift',
      'Sumo Deadlift',
      'barbell'::public.equipment_type,
      array['adductors', 'glutes', 'hamstrings', 'lower_back'],
      array['quads', 'forearms', 'core']
    ),
    (
      'plank',
      'Plank',
      'bodyweight'::public.equipment_type,
      array['core'],
      array[]::text[]
    ),
    (
      'dead-bug',
      'Dead Bug',
      'bodyweight'::public.equipment_type,
      array['core'],
      array[]::text[]
    ),
    (
      'hanging-knee-raise',
      'Hanging Knee Raise',
      'bodyweight'::public.equipment_type,
      array['core'],
      array['forearms']
    ),
    (
      'ab-wheel-rollout',
      'Ab Wheel Rollout',
      'bodyweight'::public.equipment_type,
      array['core'],
      array['lats']
    ),
    (
      'cable-crunch',
      'Cable Crunch',
      'cable'::public.equipment_type,
      array['core'],
      array[]::text[]
    ),
    (
      'kettlebell-swing',
      'Kettlebell Swing',
      'kettlebell'::public.equipment_type,
      array['glutes', 'hamstrings'],
      array['lower_back', 'core', 'forearms']
    ),
    (
      'resistance-band-pull-apart',
      'Resistance Band Pull-Apart',
      'resistance_band'::public.equipment_type,
      array['rear_delts', 'upper_back'],
      array['side_delts']
    )
),
inserted_exercises as (
  insert into public.exercises (slug, name, equipment)
  select catalogue.slug, catalogue.name, catalogue.equipment
  from catalogue
  returning id, slug
),
tag_rows as (
  select
    catalogue.slug,
    primary_muscle.muscle_group_code,
    'primary'::public.exercise_muscle_role as role
  from catalogue
  cross join lateral unnest(catalogue.primary_muscles) as primary_muscle(muscle_group_code)

  union all

  select
    catalogue.slug,
    secondary_muscle.muscle_group_code,
    'secondary'::public.exercise_muscle_role as role
  from catalogue
  cross join lateral unnest(catalogue.secondary_muscles) as secondary_muscle(muscle_group_code)
)
insert into public.exercise_muscle_groups (exercise_id, muscle_group_code, role)
select inserted_exercises.id, tag_rows.muscle_group_code, tag_rows.role
from tag_rows
join inserted_exercises using (slug);

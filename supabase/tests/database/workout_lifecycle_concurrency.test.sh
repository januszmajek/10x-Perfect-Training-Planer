#!/usr/bin/env bash

set -euo pipefail

project_id=$(sed -n 's/^project_id = "\(.*\)"/\1/p' supabase/config.toml | head -1)
db_container=$(
  docker ps \
    --filter "label=com.supabase.cli.project=${project_id}" \
    --filter "name=supabase_db_" \
    --format "{{.Names}}" \
    | head -1
)

if [[ -z "$db_container" ]]; then
  echo "Local Supabase database container is not running." >&2
  exit 1
fi

test_user_id="00000000-0000-0000-0000-000000000006"
test_workout_id="60000000-0000-0000-0000-000000000006"

run_sql() {
  docker exec "$db_container" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"
}

cleanup() {
  run_sql "delete from public.workouts where id = '${test_workout_id}';" >/dev/null 2>&1 || true
  run_sql "delete from auth.users where id = '${test_user_id}';" >/dev/null 2>&1 || true
}

trap cleanup EXIT
cleanup

run_sql "
  insert into auth.users (id, email)
  values ('${test_user_id}', 'concurrency@example.test');

  insert into public.workouts (id, user_id, status, origin)
  values ('${test_workout_id}', '${test_user_id}', 'planned', 'manual');
" >/dev/null

docker exec "$db_container" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "
  set application_name = 'workout_completion_guard';
  begin;
  update public.workouts
  set status = 'completed', completed_at = now()
  where id = '${test_workout_id}';
  select pg_sleep(3);
  commit;
" >/dev/null 2>&1 &
completion_pid=$!

completion_ready=false
for _ in {1..30}; do
  if [[ "$(run_sql "select wait_event from pg_stat_activity where application_name = 'workout_completion_guard';")" == "PgSleep" ]]; then
    completion_ready=true
    break
  fi
  sleep 0.1
done

if [[ "$completion_ready" != true ]]; then
  wait "$completion_pid" || true
  echo "Completion transaction did not reach the lock-holding state." >&2
  exit 1
fi

set +e
blocked_output=$(run_sql "
  set lock_timeout = '250ms';
  insert into public.workout_exercises (workout_id, exercise_id, position, sets, reps)
  select '${test_workout_id}', id, 0, 3, 8
  from public.exercises
  where slug = 'barbell-bench-press';
" 2>&1)
blocked_status=$?
set -e

if [[ $blocked_status -eq 0 ]] || ! grep -q "canceling statement due to lock timeout" <<<"$blocked_output"; then
  echo "Concurrent item mutation did not wait on the parent completion lock." >&2
  exit 1
fi

wait "$completion_pid"

set +e
completed_output=$(run_sql "
  insert into public.workout_exercises (workout_id, exercise_id, position, sets, reps)
  select '${test_workout_id}', id, 0, 3, 8
  from public.exercises
  where slug = 'barbell-bench-press';
" 2>&1)
completed_status=$?
set -e

if [[ $completed_status -eq 0 ]] || ! grep -q "workout exercises can only be changed while the workout is planned" <<<"$completed_output"; then
  echo "Item mutation did not reject the completed parent." >&2
  exit 1
fi

item_count=$(run_sql "select count(*) from public.workout_exercises where workout_id = '${test_workout_id}';")
if [[ "$item_count" != "0" ]]; then
  echo "An item mutation landed after completion." >&2
  exit 1
fi

echo "Workout lifecycle concurrency test passed."

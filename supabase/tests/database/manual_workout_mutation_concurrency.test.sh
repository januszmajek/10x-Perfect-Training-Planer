#!/usr/bin/env bash

set -euo pipefail

project_id=$(sed -n 's/^project_id = "\(.*\)"/\1/p' supabase/config.toml | head -1)
db_container=$(
  docker ps \
    --filter "label=com.supabase.cli.project=${project_id}" \
    --filter 'name=supabase_db_' \
    --format '{{.Names}}' \
    | head -1
)

if [[ -z "$db_container" ]]; then
  echo 'Local Supabase database container is not running.' >&2
  exit 1
fi

owner_id='00000000-0000-0000-0000-000000000031'
other_id='00000000-0000-0000-0000-000000000032'
first_stdout=$(mktemp)
first_stderr=$(mktemp)
second_stdout=$(mktemp)
second_stderr=$(mktemp)

run_sql() {
  docker exec "$db_container" psql \
    -X \
    -qAt \
    -v ON_ERROR_STOP=1 \
    --set=VERBOSITY=verbose \
    -U postgres \
    -d postgres \
    -c "$1"
}

cleanup() {
  run_sql "delete from public.workouts where user_id in ('${owner_id}', '${other_id}');" >/dev/null 2>&1 || true
  run_sql "delete from auth.users where id in ('${owner_id}', '${other_id}');" >/dev/null 2>&1 || true
  rm -f "$first_stdout" "$first_stderr" "$second_stdout" "$second_stderr"
}

rpc_sql() {
  local application_name=$1
  local exercises=$2
  local replace_existing=$3
  local expected_workout_id=$4
  local expected_revision=$5

  run_sql "
    set application_name = '${application_name}';
    begin;
    select set_config('request.jwt.claim.sub', '${owner_id}', true);
    select set_config('request.jwt.claim.role', 'authenticated', true);
    set local role authenticated;
    select public.save_manual_planned_workout('${exercises}'::jsonb, ${replace_existing}, ${expected_workout_id}, ${expected_revision});
    commit;
  "
}

wait_for_sleep() {
  local application_name=$1

  for _ in {1..40}; do
    if [[ "$(run_sql "select count(*) from pg_stat_activity where application_name = '${application_name}' and wait_event = 'PgSleep';")" == '1' ]]; then
      return 0
    fi
    sleep 0.1
  done

  return 1
}

wait_for_advisory_waiters() {
  local first_application_name=$1
  local second_application_name=$2

  for _ in {1..40}; do
    if [[ "$(run_sql "select count(*) from pg_stat_activity where application_name in ('${first_application_name}', '${second_application_name}') and wait_event = 'advisory';")" == '2' ]]; then
      return 0
    fi
    sleep 0.1
  done

  return 1
}

wait_for_parent_lock_with_advisory() {
  local application_name=$1

  for _ in {1..40}; do
    lock_state=$(run_sql "
      select
        (select count(*) from pg_stat_activity where application_name = '${application_name}' and wait_event_type = 'Lock'),
        (
          select count(*)
          from pg_locks lock
          join pg_stat_activity activity on activity.pid = lock.pid
          where activity.application_name = '${application_name}'
            and lock.locktype = 'advisory'
            and lock.granted
        );
    ")
    if [[ "$lock_state" == '1|1' ]]; then
      return 0
    fi
    sleep 0.1
  done

  return 1
}

start_advisory_gate() {
  local application_name=$1

  run_sql "
    set application_name = '${application_name}';
    begin;
    select pg_advisory_xact_lock(
      hashtextextended('perfect-training-planner:planned-workout:${owner_id}', 0)
    );
    select pg_sleep(3);
    commit;
  " >/dev/null 2>&1 &
  gate_pid=$!

  if ! wait_for_sleep "$application_name"; then
    wait "$gate_pid" || true
    echo "${application_name} did not acquire the advisory gate." >&2
    exit 1
  fi
}

assert_saved_payload() {
  local workout_id=$1
  local expected_signature=$2
  local actual_signature

  actual_signature=$(run_sql "
    select string_agg(
      exercise_id::text || ':' || sets::text || ':' || reps::text,
      ','
      order by position
    )
    from public.workout_exercises
    where workout_id = '${workout_id}';
  ")

  if [[ "$actual_signature" != "$expected_signature" ]] \
    || [[ "$(run_sql "select count(*) from public.workout_exercises where workout_id = '${workout_id}' and position in (0, 1);")" != '2' ]]; then
    echo 'The saved workout does not contain the complete ordered winning payload.' >&2
    exit 1
  fi
}

trap cleanup EXIT
cleanup

readarray -t exercise_ids < <(
  run_sql "select id from public.exercises where slug in ('barbell-bench-press', 'back-squat', 'conventional-deadlift', 'front-squat') order by slug;"
)
if [[ ${#exercise_ids[@]} -ne 4 ]]; then
  echo 'Expected catalogue fixtures are missing.' >&2
  exit 1
fi

first_payload="[{\"exercise_id\":\"${exercise_ids[0]}\",\"sets\":3,\"reps\":10},{\"exercise_id\":\"${exercise_ids[1]}\",\"sets\":4,\"reps\":8}]"
second_payload="[{\"exercise_id\":\"${exercise_ids[2]}\",\"sets\":5,\"reps\":5},{\"exercise_id\":\"${exercise_ids[3]}\",\"sets\":3,\"reps\":12}]"
first_signature="${exercise_ids[0]}:3:10,${exercise_ids[1]}:4:8"
second_signature="${exercise_ids[2]}:5:5,${exercise_ids[3]}:3:12"

run_sql "
  insert into auth.users (id, email)
  values
    ('${owner_id}', 'manual-rpc-concurrency-owner@example.test'),
    ('${other_id}', 'manual-rpc-concurrency-other@example.test');

  insert into public.workouts (user_id, status, origin)
  values ('${other_id}', 'planned', 'manual');

  insert into public.workout_exercises (workout_id, exercise_id, position, sets, reps)
  select workout.id, '${exercise_ids[0]}', 0, 9, 9
  from public.workouts workout
  where workout.user_id = '${other_id}' and workout.status = 'planned';
" >/dev/null
other_snapshot=$(run_sql "
  select md5(
    to_jsonb(workout)::text ||
    (select jsonb_agg(to_jsonb(item) order by item.position)::text from public.workout_exercises item where item.workout_id = workout.id)
  )
  from public.workouts workout
  where workout.user_id = '${other_id}' and workout.status = 'planned';
")

start_advisory_gate 'manual_first_save_gate'
set +e
rpc_sql 'manual_first_save_one' "$first_payload" false null null >"$first_stdout" 2>"$first_stderr" &
first_pid=$!
rpc_sql 'manual_first_save_two' "$second_payload" false null null >"$second_stdout" 2>"$second_stderr" &
second_pid=$!
set -e
if ! wait_for_advisory_waiters 'manual_first_save_one' 'manual_first_save_two'; then
  wait "$gate_pid" "$first_pid" "$second_pid" || true
  echo 'Concurrent first saves did not both wait on the per-owner advisory lock.' >&2
  exit 1
fi
wait "$gate_pid"
set +e
wait "$first_pid"; first_status=$?
wait "$second_pid"; second_status=$?
set -e
if [[ $first_status -eq $second_status ]] || ! grep -q 'MW001' "$first_stderr" "$second_stderr"; then
  echo 'Concurrent first saves did not produce one winner and one confirmation_required loser.' >&2
  exit 1
fi

planned_id=$(run_sql "select id from public.workouts where user_id = '${owner_id}' and status = 'planned';")
planned_revision=$(run_sql "select revision from public.workouts where id = '${planned_id}';")
if [[ "$(run_sql "select count(*) from public.workouts where user_id = '${owner_id}' and status = 'planned';")" != '1' ]]; then
  echo 'Concurrent first saves did not leave exactly one planned parent.' >&2
  exit 1
fi
winning_signature=$(run_sql "select string_agg(exercise_id::text || ':' || sets::text || ':' || reps::text, ',' order by position) from public.workout_exercises where workout_id = '${planned_id}';")
if [[ "$winning_signature" != "$first_signature" && "$winning_signature" != "$second_signature" ]]; then
  echo 'Concurrent first saves left a partial or mixed payload.' >&2
  exit 1
fi
assert_saved_payload "$planned_id" "$winning_signature"

start_advisory_gate 'manual_replace_gate'
set +e
rpc_sql 'manual_replace_one' "$first_payload" true "'${planned_id}'" "$planned_revision" >"$first_stdout" 2>"$first_stderr" &
first_pid=$!
rpc_sql 'manual_replace_two' "$second_payload" true "'${planned_id}'" "$planned_revision" >"$second_stdout" 2>"$second_stderr" &
second_pid=$!
set -e
if ! wait_for_advisory_waiters 'manual_replace_one' 'manual_replace_two'; then
  wait "$gate_pid" "$first_pid" "$second_pid" || true
  echo 'Concurrent replacements did not both wait on the per-owner advisory lock.' >&2
  exit 1
fi
wait "$gate_pid"
set +e
wait "$first_pid"; first_status=$?
wait "$second_pid"; second_status=$?
set -e
if [[ $first_status -eq $second_status ]] || ! grep -q 'MW002' "$first_stderr" "$second_stderr"; then
  echo 'Concurrent confirmed replacements did not produce one winner and one stale loser.' >&2
  exit 1
fi

planned_id=$(run_sql "select id from public.workouts where user_id = '${owner_id}' and status = 'planned';")
winning_signature=$(run_sql "select string_agg(exercise_id::text || ':' || sets::text || ':' || reps::text, ',' order by position) from public.workout_exercises where workout_id = '${planned_id}';")
if [[ "$winning_signature" != "$first_signature" && "$winning_signature" != "$second_signature" ]]; then
  echo 'Concurrent replacement left a partial or mixed payload.' >&2
  exit 1
fi
assert_saved_payload "$planned_id" "$winning_signature"

run_sql "
  set application_name = 'manual_completion_guard';
  begin;
  select set_config('request.jwt.claim.sub', '${owner_id}', true);
  select set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;
  update public.workouts set status = 'completed', completed_at = now() where id = '${planned_id}';
  select pg_sleep(3);
  commit;
" >/dev/null 2>&1 &
completion_pid=$!
if ! wait_for_sleep 'manual_completion_guard'; then
  wait "$completion_pid" || true
  echo 'Completion transaction did not hold the parent lock.' >&2
  exit 1
fi

set +e
rpc_sql 'manual_rpc_vs_completion' "$first_payload" true "'${planned_id}'" 1 >"$first_stdout" 2>"$first_stderr" &
rpc_pid=$!
set -e
if ! wait_for_parent_lock_with_advisory 'manual_rpc_vs_completion'; then
  wait "$completion_pid" "$rpc_pid" || true
  echo 'RPC did not acquire the advisory lock before waiting on the completion parent lock.' >&2
  exit 1
fi
wait "$completion_pid"
set +e
wait "$rpc_pid"; rpc_status=$?
set -e
if [[ $rpc_status -eq 0 ]] || ! grep -q 'MW002' "$first_stderr"; then
  echo 'RPC racing completion was not rejected as stale.' >&2
  exit 1
fi
completed_id=$planned_id
completed_snapshot=$(run_sql "
  select md5(
    to_jsonb(workout)::text ||
    (select jsonb_agg(to_jsonb(item) order by item.position)::text from public.workout_exercises item where item.workout_id = workout.id)
  )
  from public.workouts workout
  where workout.id = '${completed_id}' and workout.status = 'completed';
")
if [[ -z "$completed_snapshot" ]]; then
  echo 'The completion race did not preserve the complete workout as history.' >&2
  exit 1
fi

rpc_sql 'manual_create_after_completion' "$first_payload" false null null >/dev/null
planned_id=$(run_sql "select id from public.workouts where user_id = '${owner_id}' and status = 'planned';")

run_sql "
  set application_name = 'manual_child_mutation_guard';
  begin;
  select set_config('request.jwt.claim.sub', '${owner_id}', true);
  select set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;
  update public.workout_exercises set sets = sets + 1 where workout_id = '${planned_id}' and position = 0;
  select pg_sleep(3);
  commit;
" >/dev/null 2>&1 &
child_pid=$!
if ! wait_for_sleep 'manual_child_mutation_guard'; then
  wait "$child_pid" || true
  echo 'Child mutation transaction did not hold the parent lock.' >&2
  exit 1
fi

rpc_sql 'manual_rpc_vs_child_mutation' "$second_payload" true "'${planned_id}'" 1 >"$first_stdout" 2>"$first_stderr" &
rpc_pid=$!
if ! wait_for_parent_lock_with_advisory 'manual_rpc_vs_child_mutation'; then
  wait "$child_pid" "$rpc_pid" || true
  echo 'RPC did not acquire the advisory lock before waiting on the child-mutation parent lock.' >&2
  exit 1
fi
wait "$child_pid"
wait "$rpc_pid"

planned_id=$(run_sql "select id from public.workouts where user_id = '${owner_id}' and status = 'planned';")
assert_saved_payload "$planned_id" "$second_signature"

if [[ "$(run_sql "select count(*) from public.workouts where user_id = '${owner_id}' and status = 'planned';")" != '1' ]] \
  || [[ "$(run_sql "select count(*) from public.workout_exercises item left join public.workouts workout on workout.id = item.workout_id where workout.id is null;")" != '0' ]]; then
  echo 'Concurrency scenarios left duplicate parents or orphaned children.' >&2
  exit 1
fi

if [[ "$(run_sql "select md5(to_jsonb(workout)::text || (select jsonb_agg(to_jsonb(item) order by item.position)::text from public.workout_exercises item where item.workout_id = workout.id)) from public.workouts workout where workout.user_id = '${other_id}' and workout.status = 'planned';")" != "$other_snapshot" ]]; then
  echo "Concurrency scenarios changed another user's planned workout." >&2
  exit 1
fi
if [[ "$(run_sql "select md5(to_jsonb(workout)::text || (select jsonb_agg(to_jsonb(item) order by item.position)::text from public.workout_exercises item where item.workout_id = workout.id)) from public.workouts workout where workout.id = '${completed_id}' and workout.status = 'completed';")" != "$completed_snapshot" ]]; then
  echo 'Concurrency scenarios changed completed workout history.' >&2
  exit 1
fi

echo 'Manual workout mutation concurrency test passed.'

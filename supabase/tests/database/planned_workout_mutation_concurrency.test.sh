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

owner_id='00000000-0000-0000-0000-000000000051'
other_id='00000000-0000-0000-0000-000000000052'
plan_id='51000000-0000-0000-0000-000000000051'
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
    select pg_advisory_xact_lock(hashtextextended('perfect-training-planner:planned-workout:${owner_id}', 0));
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

update_rpc() {
  local application_name=$1
  local expected_revision=$2
  local payload=$3
  run_sql "
    set application_name = '${application_name}';
    begin;
    select set_config('request.jwt.claim.sub', '${owner_id}', true);
    select set_config('request.jwt.claim.role', 'authenticated', true);
    set local role authenticated;
    select public.update_planned_workout('${plan_id}', ${expected_revision}, '${payload}'::jsonb);
    commit;
  "
}

delete_rpc() {
  local application_name=$1
  local expected_revision=$2
  run_sql "
    set application_name = '${application_name}';
    begin;
    select set_config('request.jwt.claim.sub', '${owner_id}', true);
    select set_config('request.jwt.claim.role', 'authenticated', true);
    set local role authenticated;
    select public.delete_planned_workout('${plan_id}', ${expected_revision});
    commit;
  "
}

complete_rpc() {
  local application_name=$1
  local expected_revision=$2
  run_sql "
    set application_name = '${application_name}';
    begin;
    select set_config('request.jwt.claim.sub', '${owner_id}', true);
    select set_config('request.jwt.claim.role', 'authenticated', true);
    set local role authenticated;
    select public.complete_planned_workout('${plan_id}', ${expected_revision});
    commit;
  "
}

manual_rpc() {
  local application_name=$1
  local expected_revision=$2
  local payload=$3
  run_sql "
    set application_name = '${application_name}';
    begin;
    select set_config('request.jwt.claim.sub', '${owner_id}', true);
    select set_config('request.jwt.claim.role', 'authenticated', true);
    set local role authenticated;
    select public.save_manual_planned_workout('${payload}'::jsonb, true, '${plan_id}', ${expected_revision});
    commit;
  "
}

reset_plan() {
  run_sql "
    delete from public.workouts where user_id = '${owner_id}';
    insert into public.workouts (id, user_id, status, origin)
    values ('${plan_id}', '${owner_id}', 'planned', 'ai');
    insert into public.workout_exercises (workout_id, exercise_id, position, sets, reps)
    values ('${plan_id}', '${exercise_ids[0]}', 0, 3, 10);
  " >/dev/null
}

assert_plan_integrity() {
  if [[ "$(run_sql "select count(*) from public.workout_exercises item left join public.workouts workout on workout.id = item.workout_id where workout.id is null;")" != '0' ]]; then
    echo 'A concurrency scenario left orphaned workout exercises.' >&2
    exit 1
  fi
  if [[ "$(run_sql "select count(*) from public.workout_exercises where workout_id = '${plan_id}' and position <> 0;")" != '0' ]]; then
    echo 'A concurrency scenario left non-contiguous positions.' >&2
    exit 1
  fi
}

assert_one_stale_loser() {
  local first_status=$1
  local second_status=$2
  local stale_code=$3
  if [[ $first_status -eq $second_status ]] || ! grep -q "$stale_code" "$first_stderr" "$second_stderr"; then
    echo "Concurrent operations did not produce one winner and one ${stale_code} stale loser." >&2
    exit 1
  fi
}

trap cleanup EXIT
cleanup

readarray -t exercise_ids < <(
  run_sql "select id from public.exercises where slug in ('back-squat', 'barbell-bench-press', 'conventional-deadlift', 'front-squat') order by slug;"
)
if [[ ${#exercise_ids[@]} -ne 4 ]]; then
  echo 'Expected catalogue fixtures are missing.' >&2
  exit 1
fi

first_payload="[{\"exercise_id\":\"${exercise_ids[0]}\",\"sets\":4,\"reps\":8}]"
second_payload="[{\"exercise_id\":\"${exercise_ids[1]}\",\"sets\":5,\"reps\":5}]"

run_sql "
  insert into auth.users (id, email)
  values
    ('${owner_id}', 'planned-rpc-concurrency-owner@example.test'),
    ('${other_id}', 'planned-rpc-concurrency-other@example.test');
  insert into public.workouts (user_id, status, origin)
  values ('${other_id}', 'planned', 'manual');
  insert into public.workout_exercises (workout_id, exercise_id, position, sets, reps)
  select id, '${exercise_ids[2]}', 0, 9, 9
  from public.workouts where user_id = '${other_id}' and status = 'planned';
" >/dev/null
other_snapshot=$(run_sql "select md5(to_jsonb(workout)::text || (select jsonb_agg(to_jsonb(item) order by item.position)::text from public.workout_exercises item where item.workout_id = workout.id)) from public.workouts workout where workout.user_id = '${other_id}';")

reset_plan
start_advisory_gate 'planned_edit_edit_gate'
set +e
update_rpc 'planned_edit_edit_one' 1 "$first_payload" >"$first_stdout" 2>"$first_stderr" & first_pid=$!
update_rpc 'planned_edit_edit_two' 1 "$second_payload" >"$second_stdout" 2>"$second_stderr" & second_pid=$!
set -e
wait_for_advisory_waiters 'planned_edit_edit_one' 'planned_edit_edit_two'
wait "$gate_pid"
set +e
wait "$first_pid"; first_status=$?
wait "$second_pid"; second_status=$?
set -e
assert_one_stale_loser "$first_status" "$second_status" PW001
if [[ "$(run_sql "select revision from public.workouts where id = '${plan_id}';")" != '2' ]] || [[ "$(run_sql "select count(*) from public.workout_exercises where workout_id = '${plan_id}';")" != '1' ]]; then
  echo 'Edit/edit race did not leave one complete revision-2 winner.' >&2
  exit 1
fi

reset_plan
start_advisory_gate 'planned_edit_delete_gate'
set +e
update_rpc 'planned_edit_delete_edit' 1 "$first_payload" >"$first_stdout" 2>"$first_stderr" & first_pid=$!
delete_rpc 'planned_edit_delete_delete' 1 >"$second_stdout" 2>"$second_stderr" & second_pid=$!
set -e
wait_for_advisory_waiters 'planned_edit_delete_edit' 'planned_edit_delete_delete'
wait "$gate_pid"
set +e
wait "$first_pid"; first_status=$?
wait "$second_pid"; second_status=$?
set -e
assert_one_stale_loser "$first_status" "$second_status" PW001

reset_plan
start_advisory_gate 'planned_delete_delete_gate'
set +e
delete_rpc 'planned_delete_delete_one' 1 >"$first_stdout" 2>"$first_stderr" & first_pid=$!
delete_rpc 'planned_delete_delete_two' 1 >"$second_stdout" 2>"$second_stderr" & second_pid=$!
set -e
wait_for_advisory_waiters 'planned_delete_delete_one' 'planned_delete_delete_two'
wait "$gate_pid"
set +e
wait "$first_pid"; first_status=$?
wait "$second_pid"; second_status=$?
set -e
assert_one_stale_loser "$first_status" "$second_status" PW001
if [[ "$(run_sql "select count(*) from public.workouts where id = '${plan_id}';")" != '0' ]]; then
  echo 'Delete/delete race did not remove the planned workout exactly once.' >&2
  exit 1
fi

reset_plan
start_advisory_gate 'planned_edit_manual_gate'
set +e
update_rpc 'planned_edit_manual_edit' 1 "$first_payload" >"$first_stdout" 2>"$first_stderr" & first_pid=$!
manual_rpc 'planned_edit_manual_replace' 1 "$second_payload" >"$second_stdout" 2>"$second_stderr" & second_pid=$!
set -e
wait_for_advisory_waiters 'planned_edit_manual_edit' 'planned_edit_manual_replace'
wait "$gate_pid"
set +e
wait "$first_pid"; first_status=$?
wait "$second_pid"; second_status=$?
set -e
if [[ $first_status -eq $second_status ]] || ! grep -Eq 'PW001|MW002' "$first_stderr" "$second_stderr"; then
  echo 'Edit/manual-replacement race did not produce one explicit stale loser.' >&2
  exit 1
fi
if [[ "$(run_sql "select count(*) from public.workouts where user_id = '${owner_id}' and status = 'planned';")" != '1' ]]; then
  echo 'Edit/manual-replacement race did not leave exactly one planned parent.' >&2
  exit 1
fi

reset_plan
run_sql "
  set application_name = 'planned_child_guard';
  begin;
  select set_config('request.jwt.claim.sub', '${owner_id}', true);
  select set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;
  update public.workout_exercises set sets = sets + 1 where workout_id = '${plan_id}';
  select pg_sleep(3);
  commit;
" >/dev/null 2>&1 & child_pid=$!
wait_for_sleep 'planned_child_guard'
update_rpc 'planned_edit_vs_child' 1 "$second_payload" >"$first_stdout" 2>"$first_stderr" & rpc_pid=$!
wait_for_parent_lock_with_advisory 'planned_edit_vs_child'
wait "$child_pid" "$rpc_pid"
if [[ "$(run_sql "select revision from public.workouts where id = '${plan_id}';")" != '2' ]] || [[ "$(run_sql "select count(*) from public.workout_exercises where workout_id = '${plan_id}';")" != '1' ]]; then
  echo 'Edit/child race left a partial prescription or incorrect revision.' >&2
  exit 1
fi

reset_plan
start_advisory_gate 'planned_completion_completion_gate'
set +e
complete_rpc 'planned_completion_completion_one' 1 >"$first_stdout" 2>"$first_stderr" & first_pid=$!
complete_rpc 'planned_completion_completion_two' 1 >"$second_stdout" 2>"$second_stderr" & second_pid=$!
set -e
wait_for_advisory_waiters 'planned_completion_completion_one' 'planned_completion_completion_two'
wait "$gate_pid"
set +e
wait "$first_pid"; first_status=$?
wait "$second_pid"; second_status=$?
set -e
assert_one_stale_loser "$first_status" "$second_status" PW001
if [[ "$(run_sql "select count(*) from public.workouts where id = '${plan_id}' and status = 'completed' and origin = 'ai' and revision = 1 and completed_at is not null;")" != '1' ]]; then
  echo 'Completion/completion race did not leave one immutable AI-origin completion.' >&2
  exit 1
fi

for operation in edit delete manual; do
  reset_plan
  start_advisory_gate "planned_completion_${operation}_gate"
  set +e
  if [[ "$operation" == 'edit' ]]; then
    update_rpc 'planned_edit_vs_completion' 1 "$first_payload" >"$first_stdout" 2>"$first_stderr" & rpc_pid=$!
  elif [[ "$operation" == 'delete' ]]; then
    delete_rpc 'planned_delete_vs_completion' 1 >"$first_stdout" 2>"$first_stderr" & rpc_pid=$!
  else
    manual_rpc 'planned_manual_vs_completion' 1 "$second_payload" >"$first_stdout" 2>"$first_stderr" & rpc_pid=$!
  fi
  complete_rpc "planned_completion_vs_${operation}" 1 >"$second_stdout" 2>"$second_stderr" & completion_pid=$!
  set -e
  wait_for_advisory_waiters "planned_completion_vs_${operation}" "planned_${operation}_vs_completion"
  wait "$gate_pid"
  set +e
  wait "$completion_pid"; completion_status=$?
  wait "$rpc_pid"; rpc_status=$?
  set -e
  if [[ $completion_status -eq $rpc_status ]]; then
    echo "${operation}/completion race did not produce exactly one winner." >&2
    exit 1
  fi
  if [[ "$operation" == 'manual' ]]; then
    if ! grep -Eq 'PW001|MW002' "$first_stderr" "$second_stderr"; then
      echo 'Manual replacement/completion race did not expose an explicit stale loser.' >&2
      exit 1
    fi
  elif ! grep -q PW001 "$first_stderr" "$second_stderr"; then
    echo "${operation}/completion race did not expose a PW001 stale loser." >&2
    exit 1
  fi
  if [[ "$(run_sql "select count(*) from public.workouts where id = '${plan_id}' and status = 'completed' and origin = 'ai' and revision = 1 and completed_at is not null;")" != '0' ]] \
    && [[ "$(run_sql "select count(*) from public.workout_exercises where workout_id = '${plan_id}';")" != '1' ]]; then
    echo "${operation}/completion race corrupted completed workout history." >&2
    exit 1
  fi
done

reset_plan
run_sql "
  set application_name = 'planned_child_vs_completion_guard';
  begin;
  select set_config('request.jwt.claim.sub', '${owner_id}', true);
  select set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;
  update public.workout_exercises set sets = sets + 1 where workout_id = '${plan_id}';
  select pg_sleep(3);
  commit;
" >/dev/null 2>&1 & child_pid=$!
wait_for_sleep 'planned_child_vs_completion_guard'
complete_rpc 'planned_completion_vs_child' 1 >"$first_stdout" 2>"$first_stderr" & completion_pid=$!
wait_for_parent_lock_with_advisory 'planned_completion_vs_child'
wait "$child_pid" "$completion_pid"
if [[ "$(run_sql "select count(*) from public.workouts where id = '${plan_id}' and status = 'completed' and completed_at is not null and revision = 1;")" != '1' ]] \
  || [[ "$(run_sql "select sets from public.workout_exercises where workout_id = '${plan_id}' and position = 0;")" != '4' ]]; then
  echo 'Completion/child mutation race did not preserve the locked prescription as immutable history.' >&2
  exit 1
fi

assert_plan_integrity
if [[ "$(run_sql "select md5(to_jsonb(workout)::text || (select jsonb_agg(to_jsonb(item) order by item.position)::text from public.workout_exercises item where item.workout_id = workout.id)) from public.workouts workout where workout.user_id = '${other_id}';")" != "$other_snapshot" ]]; then
  echo "Concurrency scenarios changed another user's planned workout." >&2
  exit 1
fi

echo 'Planned workout mutation concurrency test passed.'

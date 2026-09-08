begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select has_type('public', 'ai_exercise_preference', 'explicit preference enum exists');
select enum_has_labels('public', 'ai_exercise_preference', array['liked', 'dont_suggest'], 'preference states are exact');
select has_table('public', 'ai_exercise_preferences', 'private preferences exist');
select has_table('public', 'ai_workout_proposals', 'private proposals exist');
select has_table('public', 'ai_workout_proposal_events', 'typed proposal events exist');
select has_table('public', 'ai_reduced_generation_confirmations', 'reduced confirmation records exist');
select col_is_pk('public', 'ai_exercise_preferences', array['user_id', 'exercise_id'], 'one preference exists per owner and exercise');
select ok((select relrowsecurity from pg_class where oid = 'public.ai_workout_proposals'::regclass), 'proposal RLS is enabled');
select ok(not has_table_privilege('authenticated', 'public.ai_workout_proposals', 'select, insert, update, delete'), 'telemetry tables have no direct authenticated access');
select ok(exists (select 1 from cron.job where jobname = 'purge-expired-ai-recommendation-data'), 'one stable retention job is installed');
select is(
  (
    select count(*)
    from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname = 'record_ai_workout_proposal'
  ),
  1::bigint,
  'proposal recording exposes one unambiguous PostgREST function'
);
select has_function(
  'public',
  'record_ai_workout_proposal',
  array['uuid[]', 'uuid'],
  'proposal recording exposes the phase-3 re-roll signature'
);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000901', 'feedback-owner@example.test'),
  ('00000000-0000-0000-0000-000000000902', 'feedback-other@example.test');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000901', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select lives_ok($$select public.set_ai_exercise_preference((select id from public.exercises where slug = 'barbell-bench-press'), 'liked')$$, 'an owner can set liked');
select is((select preference::text from public.get_ai_exercise_preferences()), 'liked', 'preference is returned through the narrow RPC');
select lives_ok($$select public.set_ai_exercise_preference((select id from public.exercises where slug = 'barbell-bench-press'), 'dont_suggest')$$, 'an owner can replace preference state');
select is((select preference::text from public.get_ai_exercise_preferences()), 'dont_suggest', 'liked and dont_suggest are mutually exclusive');
select lives_ok($$select public.set_ai_exercise_preference((select id from public.exercises where slug = 'barbell-bench-press'), null)$$, 'clearing preference is idempotent');
select is((select count(*) from public.get_ai_exercise_preferences()), 0::bigint, 'cleared preference is absent');

select set_config('test.proposal_id', (select proposal_id::text from public.record_ai_workout_proposal(array[
  (select id from public.exercises where slug = 'barbell-bench-press'),
  (select id from public.exercises where slug = 'back-squat'),
  (select id from public.exercises where slug = 'plank')
], null)), true);
select lives_ok($$select public.append_ai_workout_proposal_event(current_setting('test.proposal_id')::uuid, 'exposure')$$, 'an owner can record exposure');
select throws_ok(
  $$select public.append_ai_workout_proposal_event(current_setting('test.proposal_id')::uuid, 'removal')$$,
  'AR003'::character(5), 'validation_failed', 'event checks reject invalid typed event shapes'
);
select lives_ok($$select public.register_ai_reduced_generation_confirmation(repeat('a', 64), repeat('b', 64), 3)$$, 'an owner can register a nonce digest');
select lives_ok($$select public.consume_ai_reduced_generation_confirmation(repeat('a', 64), repeat('b', 64), 3)$$, 'a confirmation nonce is consumable once');
select throws_ok($$select public.consume_ai_reduced_generation_confirmation(repeat('a', 64), repeat('b', 64), 3)$$, 'AR001'::character(5), 'confirmation_invalid', 'a consumed nonce cannot be reused');
reset role;

update public.ai_workout_proposals set expires_at = now() - interval '1 second' where id = current_setting('test.proposal_id')::uuid;
insert into public.ai_exercise_preferences (user_id, exercise_id, preference)
values ('00000000-0000-0000-0000-000000000901', (select id from public.exercises where slug = 'back-squat'), 'liked');
select lives_ok($$select private.purge_expired_ai_recommendation_data()$$, 'retention cleanup runs');
select is((select count(*) from public.ai_workout_proposals where id = current_setting('test.proposal_id')::uuid), 0::bigint, 'expired proposals are deleted');
select is((select count(*) from public.ai_exercise_preferences where user_id = '00000000-0000-0000-0000-000000000901'), 1::bigint, 'retention preserves durable preferences');

select * from finish();
rollback;

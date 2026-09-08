-- PostgREST cannot expose overloaded functions reliably. Phase 3 replaced the
-- proposal-recording contract with the two-argument signature, so remove the
-- obsolete public wrapper while retaining the private implementation for
-- migration-history compatibility.
drop function public.record_ai_workout_proposal(uuid[]);

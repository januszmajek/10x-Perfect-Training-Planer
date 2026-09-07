create type public.ai_exercise_preference as enum ('liked', 'dont_suggest');
create type public.ai_proposal_event_type as enum ('exposure', 'reroll', 'removal', 'swap', 'retention', 'save', 'completion');

create table public.ai_exercise_preferences (
  user_id uuid not null,
  exercise_id uuid not null,
  preference public.ai_exercise_preference not null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  primary key (user_id, exercise_id),
  constraint ai_exercise_preferences_user_id_fkey foreign key (user_id)
    references auth.users (id) on update restrict on delete cascade,
  constraint ai_exercise_preferences_exercise_id_fkey foreign key (exercise_id)
    references public.exercises (id) on update restrict on delete restrict
);

create table public.ai_workout_proposals (
  id uuid primary key default gen_random_uuid(),
  lineage_id uuid not null unique default gen_random_uuid(),
  user_id uuid not null,
  created_at timestamp with time zone not null default now(),
  expires_at timestamp with time zone not null default (now() + interval '90 days'),
  constraint ai_workout_proposals_user_id_fkey foreign key (user_id)
    references auth.users (id) on update restrict on delete cascade,
  constraint ai_workout_proposals_expiry_check check (expires_at <= created_at + interval '90 days')
);

create table public.ai_workout_proposal_exercises (
  proposal_id uuid not null,
  exercise_id uuid not null,
  position integer not null,
  primary key (proposal_id, exercise_id),
  constraint ai_workout_proposal_exercises_proposal_position_key unique (proposal_id, position),
  constraint ai_workout_proposal_exercises_position_check check (position >= 0),
  constraint ai_workout_proposal_exercises_proposal_id_fkey foreign key (proposal_id)
    references public.ai_workout_proposals (id) on update restrict on delete cascade,
  constraint ai_workout_proposal_exercises_exercise_id_fkey foreign key (exercise_id)
    references public.exercises (id) on update restrict on delete restrict
);

alter table public.ai_workout_proposals add constraint ai_workout_proposals_id_user_id_key unique (id, user_id);

create table public.ai_workout_proposal_events (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null,
  user_id uuid not null,
  event_type public.ai_proposal_event_type not null,
  exercise_id uuid,
  replacement_exercise_id uuid,
  workout_id uuid,
  created_at timestamp with time zone not null default now(),
  expires_at timestamp with time zone not null default (now() + interval '90 days'),
  constraint ai_workout_proposal_events_proposal_owner_fkey foreign key (proposal_id, user_id)
    references public.ai_workout_proposals (id, user_id) on update restrict on delete cascade,
  constraint ai_workout_proposal_events_exercise_id_fkey foreign key (exercise_id)
    references public.exercises (id) on update restrict on delete restrict,
  constraint ai_workout_proposal_events_replacement_exercise_id_fkey foreign key (replacement_exercise_id)
    references public.exercises (id) on update restrict on delete restrict,
  constraint ai_workout_proposal_events_workout_id_fkey foreign key (workout_id)
    references public.workouts (id) on update restrict on delete set null,
  constraint ai_workout_proposal_events_expiry_check check (expires_at <= created_at + interval '90 days'),
  constraint ai_workout_proposal_events_shape_check check (
    (event_type in ('exposure', 'reroll') and exercise_id is null and replacement_exercise_id is null and workout_id is null)
    or (event_type in ('removal', 'retention') and exercise_id is not null and replacement_exercise_id is null and workout_id is null)
    or (event_type = 'swap' and exercise_id is not null and replacement_exercise_id is not null
      and exercise_id <> replacement_exercise_id and workout_id is null)
    or (event_type in ('save', 'completion') and exercise_id is null and replacement_exercise_id is null and workout_id is not null)
  )
);

create table public.ai_reduced_generation_confirmations (
  nonce_digest text primary key,
  user_id uuid not null,
  candidate_fingerprint text not null,
  allowed_count integer not null,
  created_at timestamp with time zone not null default now(),
  expires_at timestamp with time zone not null default (now() + interval '15 minutes'),
  consumed_at timestamp with time zone,
  constraint ai_reduced_generation_confirmations_user_id_fkey foreign key (user_id)
    references auth.users (id) on update restrict on delete cascade,
  constraint ai_reduced_generation_confirmations_nonce_digest_check check (nonce_digest ~ '^[a-f0-9]{64}$'),
  constraint ai_reduced_generation_confirmations_fingerprint_check check (candidate_fingerprint ~ '^[a-f0-9]{64}$'),
  constraint ai_reduced_generation_confirmations_allowed_count_check check (allowed_count between 3 and 4),
  constraint ai_reduced_generation_confirmations_expiry_check check (expires_at <= created_at + interval '15 minutes')
);

alter table public.workouts add column ai_proposal_lineage_id uuid;
create index ai_exercise_preferences_user_id_idx on public.ai_exercise_preferences (user_id, preference, exercise_id);
create index ai_workout_proposals_expiry_idx on public.ai_workout_proposals (expires_at);
create index ai_workout_proposal_events_expiry_idx on public.ai_workout_proposal_events (expires_at);
create index ai_reduced_generation_confirmations_expiry_idx on public.ai_reduced_generation_confirmations (expires_at);
create index workouts_ai_proposal_lineage_id_idx on public.workouts (ai_proposal_lineage_id) where ai_proposal_lineage_id is not null;

create function private.set_ai_exercise_preferences_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger set_ai_exercise_preferences_updated_at before update on public.ai_exercise_preferences
for each row execute function private.set_ai_exercise_preferences_updated_at();

alter table public.ai_exercise_preferences enable row level security;
alter table public.ai_workout_proposals enable row level security;
alter table public.ai_workout_proposal_exercises enable row level security;
alter table public.ai_workout_proposal_events enable row level security;
alter table public.ai_reduced_generation_confirmations enable row level security;

revoke all on table public.ai_exercise_preferences, public.ai_workout_proposals,
  public.ai_workout_proposal_exercises, public.ai_workout_proposal_events,
  public.ai_reduced_generation_confirmations from anon, authenticated;
grant all on table public.ai_exercise_preferences, public.ai_workout_proposals,
  public.ai_workout_proposal_exercises, public.ai_workout_proposal_events,
  public.ai_reduced_generation_confirmations to service_role;

create function public.set_ai_exercise_preference(p_exercise_id uuid, p_preference public.ai_exercise_preference default null)
returns void language plpgsql security invoker set search_path = '' as $$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception using errcode = 'AR004', message = 'unauthenticated'; end if;
  if p_exercise_id is null or not exists (select 1 from public.exercises where id = p_exercise_id) then
    raise exception using errcode = 'AR003', message = 'validation_failed';
  end if;
  if p_preference is null then
    delete from public.ai_exercise_preferences where user_id = v_user_id and exercise_id = p_exercise_id;
  else
    insert into public.ai_exercise_preferences (user_id, exercise_id, preference)
    values (v_user_id, p_exercise_id, p_preference)
    on conflict (user_id, exercise_id) do update set preference = excluded.preference;
  end if;
end;
$$;

create function public.get_ai_exercise_preferences()
returns table (exercise_id uuid, preference public.ai_exercise_preference)
language sql stable security invoker set search_path = '' as $$
  select preference.exercise_id, preference.preference
  from public.ai_exercise_preferences preference
  where preference.user_id = auth.uid()
  order by preference.exercise_id;
$$;

create function public.record_ai_workout_proposal(p_exercise_ids uuid[])
returns table (proposal_id uuid, lineage_id uuid)
language plpgsql security invoker set search_path = '' as $$
declare v_user_id uuid := auth.uid(); v_proposal_id uuid; v_lineage_id uuid;
begin
  if v_user_id is null then raise exception using errcode = 'AR004', message = 'unauthenticated'; end if;
  if p_exercise_ids is null or cardinality(p_exercise_ids) not between 3 and 7
    or cardinality(p_exercise_ids) <> (select count(distinct id) from unnest(p_exercise_ids) as id)
    or exists (select 1 from unnest(p_exercise_ids) as id where not exists (select 1 from public.exercises where exercises.id = id)) then
    raise exception using errcode = 'AR003', message = 'validation_failed';
  end if;
  insert into public.ai_workout_proposals (user_id) values (v_user_id) returning id, ai_workout_proposals.lineage_id into v_proposal_id, v_lineage_id;
  insert into public.ai_workout_proposal_exercises (proposal_id, exercise_id, position)
  select v_proposal_id, id, ordinality - 1 from unnest(p_exercise_ids) with ordinality as item(id, ordinality);
  return query select v_proposal_id, v_lineage_id;
end;
$$;

create function public.append_ai_workout_proposal_event(
  p_proposal_id uuid, p_event_type public.ai_proposal_event_type, p_exercise_id uuid default null,
  p_replacement_exercise_id uuid default null, p_workout_id uuid default null
)
returns void language plpgsql security invoker set search_path = '' as $$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception using errcode = 'AR004', message = 'unauthenticated'; end if;
  if not exists (select 1 from public.ai_workout_proposals where id = p_proposal_id and user_id = v_user_id and expires_at > now()) then
    raise exception using errcode = 'AR002', message = 'proposal_not_available';
  end if;
  if p_event_type in ('removal', 'retention', 'swap') and not exists (
    select 1 from public.ai_workout_proposal_exercises where proposal_id = p_proposal_id and exercise_id = p_exercise_id
  ) then raise exception using errcode = 'AR003', message = 'validation_failed'; end if;
  if p_workout_id is not null and not exists (
    select 1 from public.workouts where id = p_workout_id and user_id = v_user_id
  ) then raise exception using errcode = 'AR002', message = 'proposal_not_available'; end if;
  insert into public.ai_workout_proposal_events (proposal_id, user_id, event_type, exercise_id, replacement_exercise_id, workout_id)
  values (p_proposal_id, v_user_id, p_event_type, p_exercise_id, p_replacement_exercise_id, p_workout_id);
end;
$$;

create function public.register_ai_reduced_generation_confirmation(
  p_nonce_digest text, p_candidate_fingerprint text, p_allowed_count integer
)
returns void language plpgsql security invoker set search_path = '' as $$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception using errcode = 'AR004', message = 'unauthenticated'; end if;
  insert into public.ai_reduced_generation_confirmations (nonce_digest, user_id, candidate_fingerprint, allowed_count)
  values (p_nonce_digest, v_user_id, p_candidate_fingerprint, p_allowed_count);
end;
$$;

create function public.consume_ai_reduced_generation_confirmation(
  p_nonce_digest text, p_candidate_fingerprint text, p_allowed_count integer
)
returns void language plpgsql security invoker set search_path = '' as $$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception using errcode = 'AR004', message = 'unauthenticated'; end if;
  update public.ai_reduced_generation_confirmations
  set consumed_at = now()
  where nonce_digest = p_nonce_digest and user_id = v_user_id and candidate_fingerprint = p_candidate_fingerprint
    and allowed_count = p_allowed_count and consumed_at is null and expires_at > now();
  if not found then raise exception using errcode = 'AR001', message = 'confirmation_invalid'; end if;
end;
$$;

revoke all on function private.set_ai_exercise_preferences_updated_at() from public, anon, authenticated;
revoke all on function public.set_ai_exercise_preference(uuid, public.ai_exercise_preference) from public, anon;
revoke all on function public.get_ai_exercise_preferences() from public, anon;
revoke all on function public.record_ai_workout_proposal(uuid[]) from public, anon;
revoke all on function public.append_ai_workout_proposal_event(uuid, public.ai_proposal_event_type, uuid, uuid, uuid) from public, anon;
revoke all on function public.register_ai_reduced_generation_confirmation(text, text, integer) from public, anon;
revoke all on function public.consume_ai_reduced_generation_confirmation(text, text, integer) from public, anon;
grant execute on function public.set_ai_exercise_preference(uuid, public.ai_exercise_preference),
  public.get_ai_exercise_preferences(), public.record_ai_workout_proposal(uuid[]),
  public.append_ai_workout_proposal_event(uuid, public.ai_proposal_event_type, uuid, uuid, uuid),
  public.register_ai_reduced_generation_confirmation(text, text, integer),
  public.consume_ai_reduced_generation_confirmation(text, text, integer) to authenticated;

revoke all on type public.ai_exercise_preference, public.ai_proposal_event_type from public, anon, authenticated;
grant usage on type public.ai_exercise_preference, public.ai_proposal_event_type to authenticated, service_role;

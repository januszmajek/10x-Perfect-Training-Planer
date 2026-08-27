create type public.ai_provider as enum ('openrouter');

create table public.ai_provider_keys (
  user_id uuid primary key,
  provider public.ai_provider not null default 'openrouter',
  ciphertext text not null,
  iv text not null,
  key_hint text not null,
  encryption_key_version integer not null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint ai_provider_keys_user_id_fkey foreign key (user_id)
    references auth.users (id)
    on update restrict
    on delete cascade,
  constraint ai_provider_keys_ciphertext_base64url_check check (
    char_length(ciphertext) > 0
    and ciphertext ~ '^[A-Za-z0-9_-]+$'
  ),
  constraint ai_provider_keys_iv_base64url_check check (
    char_length(iv) = 16
    and iv ~ '^[A-Za-z0-9_-]+$'
  ),
  constraint ai_provider_keys_key_hint_length_check check (char_length(key_hint) = 4),
  constraint ai_provider_keys_encryption_key_version_positive_check check (encryption_key_version > 0)
);

create function private.set_ai_provider_keys_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.set_ai_provider_keys_updated_at() from public, anon, authenticated;

create trigger set_ai_provider_keys_updated_at
before update on public.ai_provider_keys
for each row
execute function private.set_ai_provider_keys_updated_at();

alter table public.ai_provider_keys enable row level security;

create policy "Owners can read AI provider keys"
  on public.ai_provider_keys
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Owners can create AI provider keys"
  on public.ai_provider_keys
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Owners can update AI provider keys"
  on public.ai_provider_keys
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Owners can delete AI provider keys"
  on public.ai_provider_keys
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.ai_provider_keys from anon, authenticated;

grant select, delete on table public.ai_provider_keys to authenticated;
grant insert (user_id, ciphertext, iv, key_hint, encryption_key_version)
  on table public.ai_provider_keys to authenticated;
grant update (user_id, ciphertext, iv, key_hint, encryption_key_version)
  on table public.ai_provider_keys to authenticated;

grant all on table public.ai_provider_keys to service_role;

revoke all on type public.ai_provider from public, anon, authenticated;
grant usage on type public.ai_provider to authenticated, service_role;

alter table public.ai_provider_keys
  add column key_prefix text;

alter table public.ai_provider_keys
  add constraint ai_provider_keys_key_prefix_length_check
  check (key_prefix is null or char_length(key_prefix) = 4);

grant insert (key_prefix) on table public.ai_provider_keys to authenticated;
grant update (key_prefix) on table public.ai_provider_keys to authenticated;

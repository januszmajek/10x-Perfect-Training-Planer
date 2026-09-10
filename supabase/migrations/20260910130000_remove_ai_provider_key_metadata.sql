revoke insert (key_prefix) on table public.ai_provider_keys from authenticated;
revoke update (key_prefix) on table public.ai_provider_keys from authenticated;

revoke insert (key_hint) on table public.ai_provider_keys from authenticated;
revoke update (key_hint) on table public.ai_provider_keys from authenticated;

alter table public.ai_provider_keys
  drop constraint ai_provider_keys_key_prefix_length_check,
  drop constraint ai_provider_keys_key_hint_length_check,
  drop column key_prefix,
  drop column key_hint;

grant insert (user_id, ciphertext, iv, encryption_key_version)
  on table public.ai_provider_keys to authenticated;
grant update (user_id, ciphertext, iv, encryption_key_version)
  on table public.ai_provider_keys to authenticated;

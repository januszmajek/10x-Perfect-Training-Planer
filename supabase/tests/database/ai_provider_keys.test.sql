begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select no_plan();

select has_type('public', 'ai_provider', 'ai_provider enum exists');
select enum_has_labels(
  'public',
  'ai_provider',
  array['openrouter'],
  'ai_provider has the single MVP value'
);
select has_table('public', 'ai_provider_keys', 'ai_provider_keys table exists');
select columns_are(
  'public',
  'ai_provider_keys',
  array[
    'user_id',
    'provider',
    'ciphertext',
    'iv',
    'key_hint',
    'encryption_key_version',
    'created_at',
    'updated_at'
  ],
  'ai_provider_keys has only the expected columns'
);
select col_is_pk('public', 'ai_provider_keys', 'user_id', 'one credential row is allowed per user');

select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'ai_provider_keys_user_id_fkey'
      and conrelid = 'public.ai_provider_keys'::regclass
      and confrelid = 'auth.users'::regclass
      and confupdtype = 'r'
      and confdeltype = 'c'
  ),
  'AI provider keys have the expected cascading auth ownership foreign key'
);
select ok(
  (
    select count(*) = 4
    from pg_catalog.pg_constraint
    where conrelid = 'public.ai_provider_keys'::regclass
      and conname in (
        'ai_provider_keys_ciphertext_base64url_check',
        'ai_provider_keys_iv_base64url_check',
        'ai_provider_keys_key_hint_length_check',
        'ai_provider_keys_encryption_key_version_positive_check'
      )
      and contype = 'c'
  ),
  'encrypted payload metadata has all expected check constraints'
);
select ok(
  (
    select column_default = '''openrouter''::ai_provider'
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'ai_provider_keys'
      and column_name = 'provider'
  ),
  'provider defaults to openrouter'
);
select ok(
  (
    select bool_and(is_nullable = 'NO')
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'ai_provider_keys'
  ),
  'every credential column is required'
);
select ok(
  exists (
    select 1
    from pg_catalog.pg_trigger
    where tgrelid = 'public.ai_provider_keys'::regclass
      and tgname = 'set_ai_provider_keys_updated_at'
      and not tgisinternal
  ),
  'the private updated_at trigger is installed'
);

select ok(
  (
    select relrowsecurity
    from pg_catalog.pg_class
    where oid = 'public.ai_provider_keys'::regclass
  ),
  'RLS is enabled on AI provider keys'
);
select policies_are(
  'public',
  'ai_provider_keys',
  array[
    'Owners can create AI provider keys',
    'Owners can delete AI provider keys',
    'Owners can read AI provider keys',
    'Owners can update AI provider keys'
  ],
  'AI provider keys have one explicit owner policy per operation'
);

select ok(
  has_table_privilege('authenticated', 'public.ai_provider_keys', 'SELECT, DELETE')
    and has_column_privilege('authenticated', 'public.ai_provider_keys', 'user_id', 'INSERT, UPDATE')
    and has_column_privilege('authenticated', 'public.ai_provider_keys', 'ciphertext', 'INSERT, UPDATE')
    and has_column_privilege('authenticated', 'public.ai_provider_keys', 'iv', 'INSERT, UPDATE')
    and has_column_privilege('authenticated', 'public.ai_provider_keys', 'key_hint', 'INSERT, UPDATE')
    and has_column_privilege(
      'authenticated',
      'public.ai_provider_keys',
      'encryption_key_version',
      'INSERT, UPDATE'
    ),
  'authenticated can read, delete, and upsert only the credential payload columns'
);
select ok(
  not has_table_privilege('authenticated', 'public.ai_provider_keys', 'INSERT, UPDATE')
    and not has_column_privilege('authenticated', 'public.ai_provider_keys', 'provider', 'INSERT, UPDATE')
    and not has_column_privilege('authenticated', 'public.ai_provider_keys', 'created_at', 'INSERT, UPDATE')
    and not has_column_privilege('authenticated', 'public.ai_provider_keys', 'updated_at', 'INSERT, UPDATE'),
  'provider and database-managed timestamps are protected from authenticated mutation'
);
select ok(
  not has_table_privilege('anon', 'public.ai_provider_keys', 'SELECT, INSERT, UPDATE, DELETE'),
  'anonymous clients have no AI provider key privileges'
);
select ok(
  has_table_privilege('service_role', 'public.ai_provider_keys', 'SELECT, INSERT, UPDATE, DELETE'),
  'service role retains full table access for administrative operations'
);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000011', 'credential-constraints@example.test'),
  ('00000000-0000-0000-0000-000000000012', 'credential-owner@example.test'),
  ('00000000-0000-0000-0000-000000000013', 'credential-other@example.test'),
  ('00000000-0000-0000-0000-000000000014', 'credential-reassignment-target@example.test');

insert into public.ai_provider_keys (
  user_id,
  ciphertext,
  iv,
  key_hint,
  encryption_key_version,
  created_at,
  updated_at
)
values (
  '00000000-0000-0000-0000-000000000011',
  'RmFrZUNpcGhlcnRleHQ',
  'AAAAAAAAAAAAAAAA',
  'hint',
  1,
  '2000-01-01 00:00:00+00',
  '2000-01-01 00:00:00+00'
);

select is(
  (
    select provider::text
    from public.ai_provider_keys
    where user_id = '00000000-0000-0000-0000-000000000011'
  ),
  'openrouter',
  'the database applies the OpenRouter provider default'
);
select throws_ok(
  $$
    insert into public.ai_provider_keys (user_id, ciphertext, iv, key_hint, encryption_key_version)
    values (
      '00000000-0000-0000-0000-000000000011',
      'QW5vdGhlckZha2VDaXBoZXJ0ZXh0',
      'BBBBBBBBBBBBBBBB',
      'last',
      1
    )
  $$,
  '23505'::character(5),
  null,
  'the primary key enforces one provider credential per user'
);
select throws_like(
  $$
    insert into public.ai_provider_keys (user_id, ciphertext, iv, key_hint, encryption_key_version)
    values ('00000000-0000-0000-0000-000000000012', '', 'AAAAAAAAAAAAAAAA', 'hint', 1)
  $$,
  '%ai_provider_keys_ciphertext_base64url_check%',
  'ciphertext cannot be empty'
);
select throws_like(
  $$
    insert into public.ai_provider_keys (user_id, ciphertext, iv, key_hint, encryption_key_version)
    values ('00000000-0000-0000-0000-000000000012', 'not+padded=', 'AAAAAAAAAAAAAAAA', 'hint', 1)
  $$,
  '%ai_provider_keys_ciphertext_base64url_check%',
  'ciphertext must use unpadded base64url characters'
);
select throws_like(
  $$
    insert into public.ai_provider_keys (user_id, ciphertext, iv, key_hint, encryption_key_version)
    values ('00000000-0000-0000-0000-000000000012', 'RmFrZQ', 'short', 'hint', 1)
  $$,
  '%ai_provider_keys_iv_base64url_check%',
  'IV metadata must encode exactly twelve bytes without padding'
);
select throws_like(
  $$
    insert into public.ai_provider_keys (user_id, ciphertext, iv, key_hint, encryption_key_version)
    values ('00000000-0000-0000-0000-000000000012', 'RmFrZQ', 'AAAAAAAAAAAAAAA=', 'hint', 1)
  $$,
  '%ai_provider_keys_iv_base64url_check%',
  'IV metadata rejects padded base64url'
);
select throws_like(
  $$
    insert into public.ai_provider_keys (user_id, ciphertext, iv, key_hint, encryption_key_version)
    values ('00000000-0000-0000-0000-000000000012', 'RmFrZQ', 'AAAAAAAAAAAAAAAA', 'abc', 1)
  $$,
  '%ai_provider_keys_key_hint_length_check%',
  'the display hint must contain exactly four characters'
);
select throws_like(
  $$
    insert into public.ai_provider_keys (user_id, ciphertext, iv, key_hint, encryption_key_version)
    values ('00000000-0000-0000-0000-000000000012', 'RmFrZQ', 'AAAAAAAAAAAAAAAA', 'hint', 0)
  $$,
  '%ai_provider_keys_encryption_key_version_positive_check%',
  'the encryption key version must be positive'
);
select throws_like(
  $$
    insert into public.ai_provider_keys (user_id, provider, ciphertext, iv, key_hint, encryption_key_version)
    values (
      '00000000-0000-0000-0000-000000000012',
      'unsupported',
      'RmFrZQ',
      'AAAAAAAAAAAAAAAA',
      'hint',
      1
    )
  $$,
  '%invalid input value for enum ai_provider%',
  'unsupported providers are rejected'
);

update public.ai_provider_keys
set ciphertext = 'VXBkYXRlZEZha2VDaXBoZXJ0ZXh0'
where user_id = '00000000-0000-0000-0000-000000000011';

select ok(
  (
    select created_at = '2000-01-01 00:00:00+00'
      and updated_at > '2000-01-01 00:00:00+00'
    from public.ai_provider_keys
    where user_id = '00000000-0000-0000-0000-000000000011'
  ),
  'the trigger advances updated_at without changing created_at'
);

insert into public.ai_provider_keys (user_id, ciphertext, iv, key_hint, encryption_key_version)
values (
  '00000000-0000-0000-0000-000000000013',
  'T3RoZXJVc2VyRmFrZUNpcGhlcnRleHQ',
  'BBBBBBBBBBBBBBBB',
  'othr',
  1
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000012', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select lives_ok(
  $$
    insert into public.ai_provider_keys (user_id, ciphertext, iv, key_hint, encryption_key_version)
    values (
      '00000000-0000-0000-0000-000000000012',
      'T3duZXJGYWtlQ2lwaGVydGV4dA',
      'CCCCCCCCCCCCCCCC',
      'ownr',
      1
    )
  $$,
  'an authenticated owner can create their credential row'
);
select throws_like(
  $$
    insert into public.ai_provider_keys (user_id, ciphertext, iv, key_hint, encryption_key_version)
    values (
      '00000000-0000-0000-0000-000000000014',
      'Tm90VGhlT3duZXJGYWtlQ2lwaGVydGV4dA',
      'DDDDDDDDDDDDDDDD',
      'nope',
      1
    )
  $$,
  '%row-level security policy for table "ai_provider_keys"%',
  'an owner cannot create a credential row for another user'
);
select is(
  (select count(*) from public.ai_provider_keys),
  1::bigint,
  'an owner sees only their own credential row'
);
select is(
  (
    select count(*)
    from public.ai_provider_keys
    where user_id = '00000000-0000-0000-0000-000000000013'
  ),
  0::bigint,
  'another user credential is invisible'
);
select lives_ok(
  $$
    insert into public.ai_provider_keys (user_id, ciphertext, iv, key_hint, encryption_key_version)
    values (
      '00000000-0000-0000-0000-000000000012',
      'UmVwbGFjZWRGYWtlQ2lwaGVydGV4dA',
      'EEEEEEEEEEEEEEEE',
      'newr',
      2
    )
    on conflict (user_id) do update
    set
      user_id = excluded.user_id,
      ciphertext = excluded.ciphertext,
      iv = excluded.iv,
      key_hint = excluded.key_hint,
      encryption_key_version = excluded.encryption_key_version
  $$,
  'the owner can atomically replace a credential through direct upsert'
);
select is(
  (
    select key_hint
    from public.ai_provider_keys
    where user_id = '00000000-0000-0000-0000-000000000012'
  ),
  'newr',
  'the direct upsert persists the replacement payload'
);
select lives_ok(
  $$
    update public.ai_provider_keys
    set user_id = '00000000-0000-0000-0000-000000000012'
    where user_id = '00000000-0000-0000-0000-000000000012'
  $$,
  'the conflict key can be updated to its existing owner value'
);
select throws_like(
  $$
    update public.ai_provider_keys
    set user_id = '00000000-0000-0000-0000-000000000014'
    where user_id = '00000000-0000-0000-0000-000000000012'
  $$,
  '%row-level security policy for table "ai_provider_keys"%',
  'RLS prevents credential ownership reassignment'
);
select throws_like(
  $$update public.ai_provider_keys set provider = 'openrouter'$$,
  '%permission denied for table ai_provider_keys%',
  'provider cannot be changed by an authenticated client'
);
select throws_like(
  $$update public.ai_provider_keys set updated_at = now()$$,
  '%permission denied for table ai_provider_keys%',
  'timestamps cannot be changed by an authenticated client'
);
select lives_ok(
  $$
    update public.ai_provider_keys
    set ciphertext = 'Tm9WaXNpYmxlQ3Jvc3NVc2VyVXBkYXRl'
    where user_id = '00000000-0000-0000-0000-000000000013'
  $$,
  'an attempted cross-user update changes no visible row'
);
select lives_ok(
  $$
    delete from public.ai_provider_keys
    where user_id = '00000000-0000-0000-0000-000000000013'
  $$,
  'an attempted cross-user delete changes no visible row'
);
select lives_ok(
  $$
    delete from public.ai_provider_keys
    where user_id = '00000000-0000-0000-0000-000000000012'
  $$,
  'an owner can remove their credential row'
);
select is(
  (select count(*) from public.ai_provider_keys),
  0::bigint,
  'the owner credential is removed from their visible rows'
);

reset role;

select is(
  (
    select ciphertext
    from public.ai_provider_keys
    where user_id = '00000000-0000-0000-0000-000000000013'
  ),
  'T3RoZXJVc2VyRmFrZUNpcGhlcnRleHQ',
  'cross-user mutation attempts leave the other credential unchanged'
);
delete from auth.users where id = '00000000-0000-0000-0000-000000000013';
select is(
  (
    select count(*)
    from public.ai_provider_keys
    where user_id = '00000000-0000-0000-0000-000000000013'
  ),
  0::bigint,
  'deleting an auth user cascades to their encrypted credential row'
);

select * from finish();
rollback;

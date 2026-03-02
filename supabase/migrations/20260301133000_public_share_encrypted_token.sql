alter table public.public_share_tokens
  add column if not exists token_encrypted text null;

comment on column public.public_share_tokens.token_encrypted is
  'Token publico cifrado para reexibir o URL em áreas privadas; nunca usado para lookup público.';

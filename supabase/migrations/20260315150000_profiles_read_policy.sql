-- Garantir que utilizadores autenticados podem ler profiles de outros membros.
-- A tabela profiles é o repositório de nome/email/avatar de todos os utilizadores.
-- Sem policy permissiva de SELECT, queries de cliente JS ficavam bloqueadas por RLS
-- e os cards de staff mostravam "??" e "—" (dados em falta).
-- A tabela não tem dados sensíveis: apenas nome, email, avatar e role.

alter table public.profiles enable row level security;

drop policy if exists "Public profiles are viewable by everyone." on public.profiles;
drop policy if exists profiles_read_authenticated_v1 on public.profiles;

create policy profiles_read_authenticated_v1
  on public.profiles
  for select
  to authenticated
  using (true);

-- B1 Billing — tabela invoices, RLS, bucket de PDFs
--
-- Tracking de facturas emitidas fora da plataforma (sales-led, sem Stripe).
-- Super-admin cria via /admin/clubs/[id]/billing; coordenador do clube consulta
-- e descarrega PDFs via tab em /club.
--
-- Estados:
--   issued    — emitida, em aberto (pode estar overdue se due_date < hoje)
--   paid      — paga (paid_at obrigatorio)
--   cancelled — anulada (factura emitida foi posteriormente cancelada)
--
-- "Em atraso" e derivado dinamicamente: status='issued' AND due_date < current_date.
-- Nao guardamos coluna separada para evitar drift entre data armazenada e relogio.

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,

  -- Identificacao (numero do software fiscal externo)
  invoice_number text not null,
  period_start date,
  period_end date,

  -- Datas
  issued_at date not null,
  due_date date not null,

  -- Valores
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null default 'EUR' check (length(currency) = 3),

  -- Status
  status text not null default 'issued'
    check (status in ('issued', 'paid', 'cancelled')),
  paid_at date,

  -- Anexo (path no bucket invoices). Obrigatorio: B1 exige PDF na criacao.
  pdf_path text not null,

  -- Notas internas (NAO visiveis ao cliente)
  notes text,

  -- Audit
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),

  -- Constraints derivadas
  constraint invoices_unique_number_per_club unique (club_id, invoice_number),
  constraint invoices_period_order check (
    period_end is null or period_start is null or period_end >= period_start
  ),
  constraint invoices_paid_requires_paid_at check (
    status <> 'paid' or paid_at is not null
  ),
  constraint invoices_due_after_issued check (due_date >= issued_at)
);

comment on table public.invoices is
  'Facturas emitidas fora da plataforma (B1, sales-led). Tracking de pagamento, sem processamento. PDF guardado no bucket invoices.';

comment on column public.invoices.invoice_number is
  'Numero/referencia da factura no software fiscal externo. Unico por clube.';
comment on column public.invoices.amount_cents is
  'Valor total em centimos da moeda indicada. Inteiro para evitar floating-point.';
comment on column public.invoices.status is
  'issued = em aberto (pode estar overdue se due_date < hoje); paid = paga; cancelled = anulada.';
comment on column public.invoices.pdf_path is
  'Path do PDF no bucket invoices. Formato: {club_id}/{invoice_id}.pdf. PDF obrigatorio em B1.';

create index invoices_club_id_idx on public.invoices (club_id);
create index invoices_status_due_idx on public.invoices (status, due_date);
create index invoices_issued_at_idx on public.invoices (issued_at desc);

-- Trigger updated_at (reutiliza funcao existente set_updated_at se houver,
-- senao cria uma minima especifica)
do $$
begin
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where p.proname = 'set_updated_at' and n.nspname = 'public'
  ) then
    create function public.set_updated_at()
    returns trigger
    language plpgsql
    as $body$
    begin
      new.updated_at = now();
      return new;
    end;
    $body$;
  end if;
end$$;

create trigger invoices_set_updated_at
  before update on public.invoices
  for each row execute function public.set_updated_at();

-- ============================================================================
-- RLS
-- ============================================================================

alter table public.invoices enable row level security;

-- Super-admin gere tudo (gate via user_is_super_coordinator)
create policy "invoices_super_admin_all"
  on public.invoices
  for all
  to authenticated
  using (public.user_is_super_coordinator())
  with check (public.user_is_super_coordinator());

-- Coordenador / admin / owner do clube le as suas
-- (boundary explicito via club_memberships, sem wrapper — guard arquitectura)
create policy "invoices_club_manager_select"
  on public.invoices
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.club_memberships cm
      where cm.club_id = invoices.club_id
        and cm.profile_id = auth.uid()
        and cm.role in ('owner', 'admin', 'coordinator')
    )
  );

-- ============================================================================
-- Storage bucket para PDFs
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'invoices',
  'invoices',
  false,
  10485760, -- 10 MB
  array['application/pdf']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Storage policies: super-admin tudo; coordenador le os do seu clube
create policy "invoices_storage_super_admin_all"
  on storage.objects
  for all
  to authenticated
  using (bucket_id = 'invoices' and public.user_is_super_coordinator())
  with check (bucket_id = 'invoices' and public.user_is_super_coordinator());

create policy "invoices_storage_club_manager_select"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'invoices'
    and exists (
      select 1
      from public.invoices i
      join public.club_memberships cm on cm.club_id = i.club_id
      where i.pdf_path = storage.objects.name
        and cm.profile_id = auth.uid()
        and cm.role in ('owner', 'admin', 'coordinator')
    )
  );

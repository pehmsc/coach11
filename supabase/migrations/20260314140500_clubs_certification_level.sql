alter table public.clubs
  add column if not exists certification_level text;

update public.clubs
set certification_level = 'none'
where certification_level is null;

alter table public.clubs
  alter column certification_level set default 'none',
  alter column certification_level set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'clubs_certification_level_check'
      and conrelid = 'public.clubs'::regclass
  ) then
    alter table public.clubs
      add constraint clubs_certification_level_check
      check (certification_level in ('none', 'cbff', 'escola_1_2', 'formadora_3', 'formadora_4_5'));
  end if;
end;
$$;

comment on column public.clubs.certification_level is
  'Nivel de certificacao FPF. Controla quais modulos admin estao disponiveis.';

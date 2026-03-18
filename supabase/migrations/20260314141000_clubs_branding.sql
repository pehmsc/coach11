alter table public.clubs
  add column if not exists primary_color text,
  add column if not exists secondary_color text,
  add column if not exists custom_domain text;

update public.clubs
set primary_color = '#1A7F4B'
where primary_color is null;

update public.clubs
set secondary_color = '#0F172A'
where secondary_color is null;

alter table public.clubs
  alter column primary_color set default '#1A7F4B',
  alter column secondary_color set default '#0F172A';

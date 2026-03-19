-- Alterar FK de age_groups.club_id para ON DELETE RESTRICT.
-- Impede apagar um clube enquanto tiver escalões associados.
-- Antes: ON DELETE CASCADE (apagava todos os escalões silenciosamente).

alter table public.age_groups
  drop constraint if exists age_groups_club_id_fkey;

alter table public.age_groups
  add constraint age_groups_club_id_fkey
  foreign key (club_id) references public.clubs(id)
  on delete restrict;

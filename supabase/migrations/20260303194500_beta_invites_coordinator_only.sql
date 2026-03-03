begin;

delete from public.beta_invites
where invite_type <> 'beta_coordinator';

alter table public.beta_invites
  drop constraint if exists beta_invites_invite_type_check;

alter table public.beta_invites
  drop constraint if exists beta_invites_target_age_group_chk;

alter table public.beta_invites
  drop constraint if exists beta_invites_staff_metadata_role_chk;

alter table public.beta_invites
  add constraint beta_invites_invite_type_coordinator_only_chk
    check (invite_type = 'beta_coordinator');

alter table public.beta_invites
  add constraint beta_invites_target_age_group_null_chk
    check (target_age_group_id is null);

commit;

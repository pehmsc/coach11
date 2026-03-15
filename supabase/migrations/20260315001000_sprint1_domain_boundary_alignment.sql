alter table public.staff_permissions
  drop constraint if exists staff_permissions_staff_id_fkey;

alter table public.staff_permissions
  add constraint staff_permissions_staff_id_fkey
  foreign key (staff_id) references public.age_group_staff(id) on delete cascade;

create or replace function public.staff_permissions_assign_club_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club_id uuid;
begin
  select ags.club_id
    into v_club_id
  from public.age_group_staff ags
  where ags.id = new.staff_id;

  if v_club_id is null then
    raise exception 'staff_permissions.staff_id invalido';
  end if;

  new.club_id := v_club_id;
  return new;
end;
$$;

drop policy if exists staff_permissions_club_access on public.staff_permissions;
drop policy if exists staff_permissions_domain_boundary_v2 on public.staff_permissions;
drop policy if exists staff_permissions_select_v1 on public.staff_permissions;
drop policy if exists staff_permissions_insert_v1 on public.staff_permissions;
drop policy if exists staff_permissions_update_v1 on public.staff_permissions;
drop policy if exists staff_permissions_delete_v1 on public.staff_permissions;
create policy staff_permissions_domain_boundary_v2
on public.staff_permissions
as restrictive
for all
to authenticated
using (
  exists (
    select 1
    from public.age_group_staff ags
    where ags.id = staff_permissions.staff_id
      and (
        ags.profile_id = auth.uid()
        or public.user_can_manage_age_group_v2(ags.age_group_id)
      )
  )
)
with check (
  exists (
    select 1
    from public.age_group_staff ags
    where ags.id = staff_permissions.staff_id
      and ags.club_id = staff_permissions.club_id
      and public.user_can_manage_age_group_v2(ags.age_group_id)
  )
);

create policy staff_permissions_select_v1
on public.staff_permissions
for select
to authenticated
using (
  exists (
    select 1
    from public.age_group_staff ags
    where ags.id = staff_permissions.staff_id
      and (
        ags.profile_id = auth.uid()
        or public.user_can_manage_age_group_v2(ags.age_group_id)
      )
  )
);

create policy staff_permissions_insert_v1
on public.staff_permissions
for insert
to authenticated
with check (
  exists (
    select 1
    from public.age_group_staff ags
    where ags.id = staff_permissions.staff_id
      and ags.club_id = staff_permissions.club_id
      and public.user_can_manage_age_group_v2(ags.age_group_id)
  )
);

create policy staff_permissions_update_v1
on public.staff_permissions
for update
to authenticated
using (
  exists (
    select 1
    from public.age_group_staff ags
    where ags.id = staff_permissions.staff_id
      and ags.club_id = staff_permissions.club_id
      and public.user_can_manage_age_group_v2(ags.age_group_id)
  )
)
with check (
  exists (
    select 1
    from public.age_group_staff ags
    where ags.id = staff_permissions.staff_id
      and ags.club_id = staff_permissions.club_id
      and public.user_can_manage_age_group_v2(ags.age_group_id)
  )
);

create policy staff_permissions_delete_v1
on public.staff_permissions
for delete
to authenticated
using (
  exists (
    select 1
    from public.age_group_staff ags
    where ags.id = staff_permissions.staff_id
      and ags.club_id = staff_permissions.club_id
      and public.user_can_manage_age_group_v2(ags.age_group_id)
  )
);

drop policy if exists exercises_club_access on public.exercises;
drop policy if exists exercises_domain_boundary_v2 on public.exercises;
drop policy if exists exercises_select_v1 on public.exercises;
drop policy if exists exercises_insert_v1 on public.exercises;
drop policy if exists exercises_update_v1 on public.exercises;
drop policy if exists exercises_delete_v1 on public.exercises;
create policy exercises_domain_boundary_v2
on public.exercises
as restrictive
for all
to authenticated
using (
  exists (
    select 1
    from public.age_groups ag
    where ag.club_id = exercises.club_id
      and public.user_can_access_age_group(ag.id)
  )
)
with check (
  exists (
    select 1
    from public.age_groups ag
    where ag.club_id = exercises.club_id
      and public.user_can_manage_age_group_v2(ag.id)
  )
);

create policy exercises_select_v1
on public.exercises
for select
to authenticated
using (
  exists (
    select 1
    from public.age_groups ag
    where ag.club_id = exercises.club_id
      and public.user_can_access_age_group(ag.id)
  )
);

create policy exercises_insert_v1
on public.exercises
for insert
to authenticated
with check (
  exists (
    select 1
    from public.age_groups ag
    where ag.club_id = exercises.club_id
      and public.user_can_manage_age_group_v2(ag.id)
  )
);

create policy exercises_update_v1
on public.exercises
for update
to authenticated
using (
  exists (
    select 1
    from public.age_groups ag
    where ag.club_id = exercises.club_id
      and public.user_can_manage_age_group_v2(ag.id)
  )
)
with check (
  exists (
    select 1
    from public.age_groups ag
    where ag.club_id = exercises.club_id
      and public.user_can_manage_age_group_v2(ag.id)
  )
);

create policy exercises_delete_v1
on public.exercises
for delete
to authenticated
using (
  exists (
    select 1
    from public.age_groups ag
    where ag.club_id = exercises.club_id
      and public.user_can_manage_age_group_v2(ag.id)
  )
);

drop policy if exists training_phases_club_access on public.training_phases;
drop policy if exists training_phases_domain_boundary_v2 on public.training_phases;
drop policy if exists training_phases_select_v1 on public.training_phases;
drop policy if exists training_phases_insert_v1 on public.training_phases;
drop policy if exists training_phases_update_v1 on public.training_phases;
drop policy if exists training_phases_delete_v1 on public.training_phases;
create policy training_phases_domain_boundary_v2
on public.training_phases
as restrictive
for all
to authenticated
using (public.user_can_access_training_session_v2(training_session_id))
with check (
  public.user_is_training_session_coordinator(training_session_id)
  and exists (
    select 1
    from public.training_sessions ts
    where ts.id = training_phases.training_session_id
      and ts.club_id = training_phases.club_id
  )
);

create policy training_phases_select_v1
on public.training_phases
for select
to authenticated
using (public.user_can_access_training_session_v2(training_session_id));

create policy training_phases_insert_v1
on public.training_phases
for insert
to authenticated
with check (
  public.user_is_training_session_coordinator(training_session_id)
  and exists (
    select 1
    from public.training_sessions ts
    where ts.id = training_phases.training_session_id
      and ts.club_id = training_phases.club_id
  )
);

create policy training_phases_update_v1
on public.training_phases
for update
to authenticated
using (
  public.user_is_training_session_coordinator(training_session_id)
  and exists (
    select 1
    from public.training_sessions ts
    where ts.id = training_phases.training_session_id
      and ts.club_id = training_phases.club_id
  )
)
with check (
  public.user_is_training_session_coordinator(training_session_id)
  and exists (
    select 1
    from public.training_sessions ts
    where ts.id = training_phases.training_session_id
      and ts.club_id = training_phases.club_id
  )
);

create policy training_phases_delete_v1
on public.training_phases
for delete
to authenticated
using (
  public.user_is_training_session_coordinator(training_session_id)
  and exists (
    select 1
    from public.training_sessions ts
    where ts.id = training_phases.training_session_id
      and ts.club_id = training_phases.club_id
  )
);

drop policy if exists tpe_club_access on public.training_phase_exercises;
drop policy if exists training_phase_exercises_domain_boundary_v2 on public.training_phase_exercises;
drop policy if exists training_phase_exercises_select_v1 on public.training_phase_exercises;
drop policy if exists training_phase_exercises_insert_v1 on public.training_phase_exercises;
drop policy if exists training_phase_exercises_update_v1 on public.training_phase_exercises;
drop policy if exists training_phase_exercises_delete_v1 on public.training_phase_exercises;
create policy training_phase_exercises_domain_boundary_v2
on public.training_phase_exercises
as restrictive
for all
to authenticated
using (
  exists (
    select 1
    from public.training_phases tp
    where tp.id = training_phase_exercises.phase_id
      and public.user_can_access_training_session_v2(tp.training_session_id)
  )
)
with check (
  exists (
    select 1
    from public.training_phases tp
    join public.training_sessions ts
      on ts.id = tp.training_session_id
    where tp.id = training_phase_exercises.phase_id
      and tp.club_id = training_phase_exercises.club_id
      and ts.club_id = training_phase_exercises.club_id
      and public.user_is_training_session_coordinator(tp.training_session_id)
  )
);

create policy training_phase_exercises_select_v1
on public.training_phase_exercises
for select
to authenticated
using (
  exists (
    select 1
    from public.training_phases tp
    where tp.id = training_phase_exercises.phase_id
      and public.user_can_access_training_session_v2(tp.training_session_id)
  )
);

create policy training_phase_exercises_insert_v1
on public.training_phase_exercises
for insert
to authenticated
with check (
  exists (
    select 1
    from public.training_phases tp
    join public.training_sessions ts
      on ts.id = tp.training_session_id
    where tp.id = training_phase_exercises.phase_id
      and tp.club_id = training_phase_exercises.club_id
      and ts.club_id = training_phase_exercises.club_id
      and public.user_is_training_session_coordinator(tp.training_session_id)
  )
);

create policy training_phase_exercises_update_v1
on public.training_phase_exercises
for update
to authenticated
using (
  exists (
    select 1
    from public.training_phases tp
    join public.training_sessions ts
      on ts.id = tp.training_session_id
    where tp.id = training_phase_exercises.phase_id
      and tp.club_id = training_phase_exercises.club_id
      and ts.club_id = training_phase_exercises.club_id
      and public.user_is_training_session_coordinator(tp.training_session_id)
  )
)
with check (
  exists (
    select 1
    from public.training_phases tp
    join public.training_sessions ts
      on ts.id = tp.training_session_id
    where tp.id = training_phase_exercises.phase_id
      and tp.club_id = training_phase_exercises.club_id
      and ts.club_id = training_phase_exercises.club_id
      and public.user_is_training_session_coordinator(tp.training_session_id)
  )
);

create policy training_phase_exercises_delete_v1
on public.training_phase_exercises
for delete
to authenticated
using (
  exists (
    select 1
    from public.training_phases tp
    join public.training_sessions ts
      on ts.id = tp.training_session_id
    where tp.id = training_phase_exercises.phase_id
      and tp.club_id = training_phase_exercises.club_id
      and ts.club_id = training_phase_exercises.club_id
      and public.user_is_training_session_coordinator(tp.training_session_id)
  )
);

drop policy if exists pba_club_access on public.player_behavioral_assessments;
drop policy if exists player_behavioral_assessments_domain_boundary_v2 on public.player_behavioral_assessments;
drop policy if exists player_behavioral_assessments_select_v1 on public.player_behavioral_assessments;
drop policy if exists player_behavioral_assessments_insert_v1 on public.player_behavioral_assessments;
drop policy if exists player_behavioral_assessments_update_v1 on public.player_behavioral_assessments;
drop policy if exists player_behavioral_assessments_delete_v1 on public.player_behavioral_assessments;
create policy player_behavioral_assessments_domain_boundary_v2
on public.player_behavioral_assessments
as restrictive
for all
to authenticated
using (
  exists (
    select 1
    from public.players p
    where p.id = player_behavioral_assessments.player_id
      and public.user_can_access_age_group(p.age_group_id)
  )
)
with check (
  exists (
    select 1
    from public.players p
    where p.id = player_behavioral_assessments.player_id
      and p.club_id = player_behavioral_assessments.club_id
      and public.user_can_manage_age_group_v2(p.age_group_id)
  )
);

create policy player_behavioral_assessments_select_v1
on public.player_behavioral_assessments
for select
to authenticated
using (
  exists (
    select 1
    from public.players p
    where p.id = player_behavioral_assessments.player_id
      and public.user_can_access_age_group(p.age_group_id)
  )
);

create policy player_behavioral_assessments_insert_v1
on public.player_behavioral_assessments
for insert
to authenticated
with check (
  exists (
    select 1
    from public.players p
    where p.id = player_behavioral_assessments.player_id
      and p.club_id = player_behavioral_assessments.club_id
      and public.user_can_manage_age_group_v2(p.age_group_id)
  )
);

create policy player_behavioral_assessments_update_v1
on public.player_behavioral_assessments
for update
to authenticated
using (
  exists (
    select 1
    from public.players p
    where p.id = player_behavioral_assessments.player_id
      and p.club_id = player_behavioral_assessments.club_id
      and public.user_can_manage_age_group_v2(p.age_group_id)
  )
)
with check (
  exists (
    select 1
    from public.players p
    where p.id = player_behavioral_assessments.player_id
      and p.club_id = player_behavioral_assessments.club_id
      and public.user_can_manage_age_group_v2(p.age_group_id)
  )
);

create policy player_behavioral_assessments_delete_v1
on public.player_behavioral_assessments
for delete
to authenticated
using (
  exists (
    select 1
    from public.players p
    where p.id = player_behavioral_assessments.player_id
      and p.club_id = player_behavioral_assessments.club_id
      and public.user_can_manage_age_group_v2(p.age_group_id)
  )
);

drop policy if exists so_club_access on public.season_objectives;
drop policy if exists season_objectives_domain_boundary_v2 on public.season_objectives;
drop policy if exists season_objectives_select_v1 on public.season_objectives;
drop policy if exists season_objectives_insert_v1 on public.season_objectives;
drop policy if exists season_objectives_update_v1 on public.season_objectives;
drop policy if exists season_objectives_delete_v1 on public.season_objectives;
create policy season_objectives_domain_boundary_v2
on public.season_objectives
as restrictive
for all
to authenticated
using (public.user_can_access_age_group(age_group_id))
with check (
  public.user_can_manage_age_group_v2(age_group_id)
  and exists (
    select 1
    from public.age_groups ag
    where ag.id = season_objectives.age_group_id
      and ag.club_id = season_objectives.club_id
  )
);

create policy season_objectives_select_v1
on public.season_objectives
for select
to authenticated
using (public.user_can_access_age_group(age_group_id));

create policy season_objectives_insert_v1
on public.season_objectives
for insert
to authenticated
with check (
  public.user_can_manage_age_group_v2(age_group_id)
  and exists (
    select 1
    from public.age_groups ag
    where ag.id = season_objectives.age_group_id
      and ag.club_id = season_objectives.club_id
  )
);

create policy season_objectives_update_v1
on public.season_objectives
for update
to authenticated
using (
  public.user_can_manage_age_group_v2(age_group_id)
  and exists (
    select 1
    from public.age_groups ag
    where ag.id = season_objectives.age_group_id
      and ag.club_id = season_objectives.club_id
  )
)
with check (
  public.user_can_manage_age_group_v2(age_group_id)
  and exists (
    select 1
    from public.age_groups ag
    where ag.id = season_objectives.age_group_id
      and ag.club_id = season_objectives.club_id
  )
);

create policy season_objectives_delete_v1
on public.season_objectives
for delete
to authenticated
using (
  public.user_can_manage_age_group_v2(age_group_id)
  and exists (
    select 1
    from public.age_groups ag
    where ag.id = season_objectives.age_group_id
      and ag.club_id = season_objectives.club_id
  )
);

drop policy if exists pd_club_access on public.player_documents;
drop policy if exists player_documents_domain_boundary_v2 on public.player_documents;
drop policy if exists player_documents_select_v1 on public.player_documents;
drop policy if exists player_documents_insert_v1 on public.player_documents;
drop policy if exists player_documents_update_v1 on public.player_documents;
drop policy if exists player_documents_delete_v1 on public.player_documents;
create policy player_documents_domain_boundary_v2
on public.player_documents
as restrictive
for all
to authenticated
using (
  exists (
    select 1
    from public.players p
    where p.id = player_documents.player_id
      and public.user_can_access_age_group(p.age_group_id)
  )
)
with check (
  exists (
    select 1
    from public.players p
    where p.id = player_documents.player_id
      and p.club_id = player_documents.club_id
      and public.user_can_manage_age_group_v2(p.age_group_id)
  )
);

create policy player_documents_select_v1
on public.player_documents
for select
to authenticated
using (
  exists (
    select 1
    from public.players p
    where p.id = player_documents.player_id
      and public.user_can_access_age_group(p.age_group_id)
  )
);

create policy player_documents_insert_v1
on public.player_documents
for insert
to authenticated
with check (
  exists (
    select 1
    from public.players p
    where p.id = player_documents.player_id
      and p.club_id = player_documents.club_id
      and public.user_can_manage_age_group_v2(p.age_group_id)
  )
);

create policy player_documents_update_v1
on public.player_documents
for update
to authenticated
using (
  exists (
    select 1
    from public.players p
    where p.id = player_documents.player_id
      and p.club_id = player_documents.club_id
      and public.user_can_manage_age_group_v2(p.age_group_id)
  )
)
with check (
  exists (
    select 1
    from public.players p
    where p.id = player_documents.player_id
      and p.club_id = player_documents.club_id
      and public.user_can_manage_age_group_v2(p.age_group_id)
  )
);

create policy player_documents_delete_v1
on public.player_documents
for delete
to authenticated
using (
  exists (
    select 1
    from public.players p
    where p.id = player_documents.player_id
      and p.club_id = player_documents.club_id
      and public.user_can_manage_age_group_v2(p.age_group_id)
  )
);

drop policy if exists pr_club_access on public.player_registrations;
drop policy if exists player_registrations_domain_boundary_v2 on public.player_registrations;
drop policy if exists player_registrations_select_v1 on public.player_registrations;
drop policy if exists player_registrations_insert_v1 on public.player_registrations;
drop policy if exists player_registrations_update_v1 on public.player_registrations;
drop policy if exists player_registrations_delete_v1 on public.player_registrations;
create policy player_registrations_domain_boundary_v2
on public.player_registrations
as restrictive
for all
to authenticated
using (
  exists (
    select 1
    from public.players p
    where p.id = player_registrations.player_id
      and public.user_can_access_age_group(p.age_group_id)
  )
)
with check (
  exists (
    select 1
    from public.players p
    where p.id = player_registrations.player_id
      and p.club_id = player_registrations.club_id
      and public.user_can_manage_age_group_v2(p.age_group_id)
  )
  and (
    player_registrations.team_id is null
    or exists (
      select 1
      from public.teams t
      where t.id = player_registrations.team_id
        and t.club_id = player_registrations.club_id
    )
  )
);

create policy player_registrations_select_v1
on public.player_registrations
for select
to authenticated
using (
  exists (
    select 1
    from public.players p
    where p.id = player_registrations.player_id
      and public.user_can_access_age_group(p.age_group_id)
  )
);

create policy player_registrations_insert_v1
on public.player_registrations
for insert
to authenticated
with check (
  exists (
    select 1
    from public.players p
    where p.id = player_registrations.player_id
      and p.club_id = player_registrations.club_id
      and public.user_can_manage_age_group_v2(p.age_group_id)
  )
  and (
    player_registrations.team_id is null
    or exists (
      select 1
      from public.teams t
      where t.id = player_registrations.team_id
        and t.club_id = player_registrations.club_id
    )
  )
);

create policy player_registrations_update_v1
on public.player_registrations
for update
to authenticated
using (
  exists (
    select 1
    from public.players p
    where p.id = player_registrations.player_id
      and p.club_id = player_registrations.club_id
      and public.user_can_manage_age_group_v2(p.age_group_id)
  )
)
with check (
  exists (
    select 1
    from public.players p
    where p.id = player_registrations.player_id
      and p.club_id = player_registrations.club_id
      and public.user_can_manage_age_group_v2(p.age_group_id)
  )
  and (
    player_registrations.team_id is null
    or exists (
      select 1
      from public.teams t
      where t.id = player_registrations.team_id
        and t.club_id = player_registrations.club_id
    )
  )
);

create policy player_registrations_delete_v1
on public.player_registrations
for delete
to authenticated
using (
  exists (
    select 1
    from public.players p
    where p.id = player_registrations.player_id
      and p.club_id = player_registrations.club_id
      and public.user_can_manage_age_group_v2(p.age_group_id)
  )
);

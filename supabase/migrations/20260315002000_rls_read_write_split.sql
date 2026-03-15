create or replace function public.user_can_read_club_scope(p_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_club_id is not null
    and (
      public.user_is_super_coordinator()
      or exists (
        select 1
        from public.age_groups ag
        where ag.club_id = p_club_id
          and ag.coordinator_id = auth.uid()
      )
      or exists (
        select 1
        from public.age_group_staff ags
        where ags.club_id = p_club_id
          and ags.profile_id = auth.uid()
      )
    );
$$;

create or replace function public.user_can_write_age_group_scope(
  p_age_group_id uuid,
  p_club_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_age_group_id is not null
    and p_club_id is not null
    and (
      public.user_is_super_coordinator()
      or exists (
        select 1
        from public.age_groups ag
        where ag.id = p_age_group_id
          and ag.club_id = p_club_id
          and ag.coordinator_id = auth.uid()
      )
      or exists (
        select 1
        from public.age_group_staff ags
        where ags.age_group_id = p_age_group_id
          and ags.club_id = p_club_id
          and ags.profile_id = auth.uid()
      )
    );
$$;

alter table public.exercises
  add column if not exists age_group_id uuid references public.age_groups(id) on delete cascade;

create or replace function public.exercises_assign_club_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club_id uuid;
begin
  select ag.club_id
    into v_club_id
  from public.age_groups ag
  where ag.id = new.age_group_id;

  if v_club_id is null then
    raise exception 'exercises.age_group_id invalido';
  end if;

  new.club_id := v_club_id;
  return new;
end;
$$;

drop trigger if exists trg_exercises_assign_club_id on public.exercises;
create trigger trg_exercises_assign_club_id
before insert or update of age_group_id, club_id
on public.exercises
for each row
execute function public.exercises_assign_club_id();

create index if not exists exercises_age_group_id_idx
  on public.exercises(age_group_id);

do $$
begin
  if not exists (
    select 1
    from public.exercises
    where age_group_id is null
  ) then
    alter table public.exercises
      alter column age_group_id set not null;
  end if;
end;
$$;

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
using (public.user_can_read_club_scope(club_id))
with check (
  exists (
    select 1
    from public.age_group_staff target_ags
    where target_ags.id = staff_permissions.staff_id
      and target_ags.club_id = staff_permissions.club_id
      and public.user_can_write_age_group_scope(
        target_ags.age_group_id,
        staff_permissions.club_id
      )
  )
);

create policy staff_permissions_select_v1
on public.staff_permissions
for select
to authenticated
using (public.user_can_read_club_scope(club_id));

create policy staff_permissions_insert_v1
on public.staff_permissions
for insert
to authenticated
with check (
  exists (
    select 1
    from public.age_group_staff target_ags
    where target_ags.id = staff_permissions.staff_id
      and target_ags.club_id = staff_permissions.club_id
      and public.user_can_write_age_group_scope(
        target_ags.age_group_id,
        staff_permissions.club_id
      )
  )
);

create policy staff_permissions_update_v1
on public.staff_permissions
for update
to authenticated
using (
  exists (
    select 1
    from public.age_group_staff target_ags
    where target_ags.id = staff_permissions.staff_id
      and target_ags.club_id = staff_permissions.club_id
      and public.user_can_write_age_group_scope(
        target_ags.age_group_id,
        staff_permissions.club_id
      )
  )
)
with check (
  exists (
    select 1
    from public.age_group_staff target_ags
    where target_ags.id = staff_permissions.staff_id
      and target_ags.club_id = staff_permissions.club_id
      and public.user_can_write_age_group_scope(
        target_ags.age_group_id,
        staff_permissions.club_id
      )
  )
);

create policy staff_permissions_delete_v1
on public.staff_permissions
for delete
to authenticated
using (
  exists (
    select 1
    from public.age_group_staff target_ags
    where target_ags.id = staff_permissions.staff_id
      and target_ags.club_id = staff_permissions.club_id
      and public.user_can_write_age_group_scope(
        target_ags.age_group_id,
        staff_permissions.club_id
      )
  )
);

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
using (public.user_can_read_club_scope(club_id))
with check (public.user_can_write_age_group_scope(age_group_id, club_id));

create policy exercises_select_v1
on public.exercises
for select
to authenticated
using (public.user_can_read_club_scope(club_id));

create policy exercises_insert_v1
on public.exercises
for insert
to authenticated
with check (public.user_can_write_age_group_scope(age_group_id, club_id));

create policy exercises_update_v1
on public.exercises
for update
to authenticated
using (public.user_can_write_age_group_scope(age_group_id, club_id))
with check (public.user_can_write_age_group_scope(age_group_id, club_id));

create policy exercises_delete_v1
on public.exercises
for delete
to authenticated
using (public.user_can_write_age_group_scope(age_group_id, club_id));

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
using (public.user_can_read_club_scope(club_id))
with check (
  exists (
    select 1
    from public.training_sessions ts
    left join public.teams t
      on t.id = ts.team_id
    where ts.id = training_phases.training_session_id
      and ts.club_id = training_phases.club_id
      and public.user_can_write_age_group_scope(
        coalesce(ts.age_group_id, t.age_group_id),
        training_phases.club_id
      )
  )
);

create policy training_phases_select_v1
on public.training_phases
for select
to authenticated
using (public.user_can_read_club_scope(club_id));

create policy training_phases_insert_v1
on public.training_phases
for insert
to authenticated
with check (
  exists (
    select 1
    from public.training_sessions ts
    left join public.teams t
      on t.id = ts.team_id
    where ts.id = training_phases.training_session_id
      and ts.club_id = training_phases.club_id
      and public.user_can_write_age_group_scope(
        coalesce(ts.age_group_id, t.age_group_id),
        training_phases.club_id
      )
  )
);

create policy training_phases_update_v1
on public.training_phases
for update
to authenticated
using (
  exists (
    select 1
    from public.training_sessions ts
    left join public.teams t
      on t.id = ts.team_id
    where ts.id = training_phases.training_session_id
      and ts.club_id = training_phases.club_id
      and public.user_can_write_age_group_scope(
        coalesce(ts.age_group_id, t.age_group_id),
        training_phases.club_id
      )
  )
)
with check (
  exists (
    select 1
    from public.training_sessions ts
    left join public.teams t
      on t.id = ts.team_id
    where ts.id = training_phases.training_session_id
      and ts.club_id = training_phases.club_id
      and public.user_can_write_age_group_scope(
        coalesce(ts.age_group_id, t.age_group_id),
        training_phases.club_id
      )
  )
);

create policy training_phases_delete_v1
on public.training_phases
for delete
to authenticated
using (
  exists (
    select 1
    from public.training_sessions ts
    left join public.teams t
      on t.id = ts.team_id
    where ts.id = training_phases.training_session_id
      and ts.club_id = training_phases.club_id
      and public.user_can_write_age_group_scope(
        coalesce(ts.age_group_id, t.age_group_id),
        training_phases.club_id
      )
  )
);

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
using (public.user_can_read_club_scope(club_id))
with check (
  exists (
    select 1
    from public.training_phases tp
    join public.training_sessions ts
      on ts.id = tp.training_session_id
    left join public.teams t
      on t.id = ts.team_id
    where tp.id = training_phase_exercises.phase_id
      and tp.club_id = training_phase_exercises.club_id
      and ts.club_id = training_phase_exercises.club_id
      and public.user_can_write_age_group_scope(
        coalesce(ts.age_group_id, t.age_group_id),
        training_phase_exercises.club_id
      )
  )
);

create policy training_phase_exercises_select_v1
on public.training_phase_exercises
for select
to authenticated
using (public.user_can_read_club_scope(club_id));

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
    left join public.teams t
      on t.id = ts.team_id
    where tp.id = training_phase_exercises.phase_id
      and tp.club_id = training_phase_exercises.club_id
      and ts.club_id = training_phase_exercises.club_id
      and public.user_can_write_age_group_scope(
        coalesce(ts.age_group_id, t.age_group_id),
        training_phase_exercises.club_id
      )
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
    left join public.teams t
      on t.id = ts.team_id
    where tp.id = training_phase_exercises.phase_id
      and tp.club_id = training_phase_exercises.club_id
      and ts.club_id = training_phase_exercises.club_id
      and public.user_can_write_age_group_scope(
        coalesce(ts.age_group_id, t.age_group_id),
        training_phase_exercises.club_id
      )
  )
)
with check (
  exists (
    select 1
    from public.training_phases tp
    join public.training_sessions ts
      on ts.id = tp.training_session_id
    left join public.teams t
      on t.id = ts.team_id
    where tp.id = training_phase_exercises.phase_id
      and tp.club_id = training_phase_exercises.club_id
      and ts.club_id = training_phase_exercises.club_id
      and public.user_can_write_age_group_scope(
        coalesce(ts.age_group_id, t.age_group_id),
        training_phase_exercises.club_id
      )
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
    left join public.teams t
      on t.id = ts.team_id
    where tp.id = training_phase_exercises.phase_id
      and tp.club_id = training_phase_exercises.club_id
      and ts.club_id = training_phase_exercises.club_id
      and public.user_can_write_age_group_scope(
        coalesce(ts.age_group_id, t.age_group_id),
        training_phase_exercises.club_id
      )
  )
);

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
using (public.user_can_read_club_scope(club_id))
with check (
  exists (
    select 1
    from public.players p
    where p.id = player_behavioral_assessments.player_id
      and p.club_id = player_behavioral_assessments.club_id
      and public.user_can_write_age_group_scope(
        p.age_group_id,
        player_behavioral_assessments.club_id
      )
  )
);

create policy player_behavioral_assessments_select_v1
on public.player_behavioral_assessments
for select
to authenticated
using (public.user_can_read_club_scope(club_id));

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
      and public.user_can_write_age_group_scope(
        p.age_group_id,
        player_behavioral_assessments.club_id
      )
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
      and public.user_can_write_age_group_scope(
        p.age_group_id,
        player_behavioral_assessments.club_id
      )
  )
)
with check (
  exists (
    select 1
    from public.players p
    where p.id = player_behavioral_assessments.player_id
      and p.club_id = player_behavioral_assessments.club_id
      and public.user_can_write_age_group_scope(
        p.age_group_id,
        player_behavioral_assessments.club_id
      )
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
      and public.user_can_write_age_group_scope(
        p.age_group_id,
        player_behavioral_assessments.club_id
      )
  )
);

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
using (public.user_can_read_club_scope(club_id))
with check (public.user_can_write_age_group_scope(age_group_id, club_id));

create policy season_objectives_select_v1
on public.season_objectives
for select
to authenticated
using (public.user_can_read_club_scope(club_id));

create policy season_objectives_insert_v1
on public.season_objectives
for insert
to authenticated
with check (public.user_can_write_age_group_scope(age_group_id, club_id));

create policy season_objectives_update_v1
on public.season_objectives
for update
to authenticated
using (public.user_can_write_age_group_scope(age_group_id, club_id))
with check (public.user_can_write_age_group_scope(age_group_id, club_id));

create policy season_objectives_delete_v1
on public.season_objectives
for delete
to authenticated
using (public.user_can_write_age_group_scope(age_group_id, club_id));

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
using (public.user_can_read_club_scope(club_id))
with check (
  exists (
    select 1
    from public.players p
    where p.id = player_documents.player_id
      and p.club_id = player_documents.club_id
      and public.user_can_write_age_group_scope(
        p.age_group_id,
        player_documents.club_id
      )
  )
);

create policy player_documents_select_v1
on public.player_documents
for select
to authenticated
using (public.user_can_read_club_scope(club_id));

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
      and public.user_can_write_age_group_scope(
        p.age_group_id,
        player_documents.club_id
      )
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
      and public.user_can_write_age_group_scope(
        p.age_group_id,
        player_documents.club_id
      )
  )
)
with check (
  exists (
    select 1
    from public.players p
    where p.id = player_documents.player_id
      and p.club_id = player_documents.club_id
      and public.user_can_write_age_group_scope(
        p.age_group_id,
        player_documents.club_id
      )
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
      and public.user_can_write_age_group_scope(
        p.age_group_id,
        player_documents.club_id
      )
  )
);

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
using (public.user_can_read_club_scope(club_id))
with check (
  exists (
    select 1
    from public.players p
    where p.id = player_registrations.player_id
      and p.club_id = player_registrations.club_id
      and public.user_can_write_age_group_scope(
        p.age_group_id,
        player_registrations.club_id
      )
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
using (public.user_can_read_club_scope(club_id));

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
      and public.user_can_write_age_group_scope(
        p.age_group_id,
        player_registrations.club_id
      )
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
      and public.user_can_write_age_group_scope(
        p.age_group_id,
        player_registrations.club_id
      )
  )
)
with check (
  exists (
    select 1
    from public.players p
    where p.id = player_registrations.player_id
      and p.club_id = player_registrations.club_id
      and public.user_can_write_age_group_scope(
        p.age_group_id,
        player_registrations.club_id
      )
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
      and public.user_can_write_age_group_scope(
        p.age_group_id,
        player_registrations.club_id
      )
  )
);

drop policy if exists exercise_images_upload on storage.objects;
create policy exercise_images_upload
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'exercise-images'
  and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and split_part(name, '/', 3) <> ''
  and public.user_can_read_club_scope(split_part(name, '/', 1)::uuid)
  and public.user_can_write_age_group_scope(
    split_part(name, '/', 2)::uuid,
    split_part(name, '/', 1)::uuid
  )
);

drop policy if exists exercise_images_read on storage.objects;
create policy exercise_images_read
on storage.objects
for select
to authenticated
using (
  bucket_id = 'exercise-images'
  and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and split_part(name, '/', 3) <> ''
  and public.user_can_read_club_scope(split_part(name, '/', 1)::uuid)
);

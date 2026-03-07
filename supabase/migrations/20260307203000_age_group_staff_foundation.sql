-- Converge o modelo funcional de staff para o escalão.
-- `age_group_staff` passa a ser a fonte de verdade do staff técnico,
-- mantendo `team_staff` como espelho de compatibilidade.

create table if not exists public.age_group_staff (
  id uuid primary key default gen_random_uuid(),
  age_group_id uuid not null
    references public.age_groups(id) on delete cascade,
  club_id uuid not null
    references public.clubs(id) on delete cascade,
  profile_id uuid not null
    references public.profiles(id) on delete cascade,
  linked_team_id uuid null
    references public.teams(id) on delete set null,
  role text not null
    check (role in ('coach', 'assistant_coach')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (age_group_id, profile_id)
);

create index if not exists age_group_staff_age_group_id_idx
  on public.age_group_staff(age_group_id);

create index if not exists age_group_staff_club_id_idx
  on public.age_group_staff(club_id);

create index if not exists age_group_staff_profile_id_idx
  on public.age_group_staff(profile_id);

create index if not exists age_group_staff_linked_team_id_idx
  on public.age_group_staff(linked_team_id);

create or replace function public.resolve_age_group_primary_team_id(
  p_age_group_id uuid
)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select t.id
  from public.teams t
  where t.age_group_id = p_age_group_id
  order by t.created_at asc nulls last, t.id asc
  limit 1;
$$;

create or replace function public.age_group_staff_assign_validate_refs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_age_group_club_id uuid;
  v_linked_team_age_group_id uuid;
begin
  select ag.club_id
    into v_age_group_club_id
  from public.age_groups ag
  where ag.id = new.age_group_id;

  if v_age_group_club_id is null then
    raise exception 'age_group_staff.age_group_id invalido';
  end if;

  new.club_id := v_age_group_club_id;

  if new.linked_team_id is not null then
    select t.age_group_id
      into v_linked_team_age_group_id
    from public.teams t
    where t.id = new.linked_team_id;

    if v_linked_team_age_group_id is null then
      raise exception 'age_group_staff.linked_team_id invalido';
    end if;

    if v_linked_team_age_group_id is distinct from new.age_group_id then
      raise exception 'age_group_staff.linked_team_id deve pertencer ao mesmo age_group';
    end if;
  end if;

  if new.linked_team_id is null then
    new.linked_team_id := public.resolve_age_group_primary_team_id(new.age_group_id);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_age_group_staff_assign_validate_refs on public.age_group_staff;
create trigger trg_age_group_staff_assign_validate_refs
before insert or update of age_group_id, club_id, linked_team_id
on public.age_group_staff
for each row
execute function public.age_group_staff_assign_validate_refs();

create or replace function public.age_group_staff_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_age_group_staff_set_updated_at on public.age_group_staff;
create trigger trg_age_group_staff_set_updated_at
before update on public.age_group_staff
for each row
execute function public.age_group_staff_set_updated_at();

create or replace function public.repair_club_membership_state(
  p_club_id uuid,
  p_profile_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_coordinator boolean := false;
  v_is_staff boolean := false;
begin
  if p_club_id is null or p_profile_id is null then
    return;
  end if;

  select exists (
    select 1
    from public.age_groups ag
    where ag.club_id = p_club_id
      and ag.coordinator_id = p_profile_id
  )
  into v_is_coordinator;

  select exists (
    select 1
    from public.age_group_staff ags
    where ags.club_id = p_club_id
      and ags.profile_id = p_profile_id
  )
  into v_is_staff;

  if v_is_coordinator then
    insert into public.club_memberships (club_id, profile_id, role)
    values (p_club_id, p_profile_id, 'coordinator')
    on conflict (club_id, profile_id)
    do update set role =
      case
        when public.club_memberships.role in ('owner', 'admin') then public.club_memberships.role
        else 'coordinator'
      end;
    return;
  end if;

  if v_is_staff then
    insert into public.club_memberships (club_id, profile_id, role)
    values (p_club_id, p_profile_id, 'staff')
    on conflict (club_id, profile_id)
    do update set role =
      case
        when public.club_memberships.role in ('owner', 'admin') then public.club_memberships.role
        else 'staff'
      end;
    return;
  end if;

  delete from public.club_memberships cm
  where cm.club_id = p_club_id
    and cm.profile_id = p_profile_id
    and cm.role not in ('owner', 'admin');
end;
$$;

create or replace function public.age_groups_sync_coordinator_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if old.club_id is distinct from new.club_id
       or old.coordinator_id is distinct from new.coordinator_id then
      perform public.repair_club_membership_state(old.club_id, old.coordinator_id);
    end if;
  end if;

  perform public.repair_club_membership_state(new.club_id, new.coordinator_id);
  return new;
end;
$$;

create or replace function public.age_group_staff_sync_club_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.repair_club_membership_state(old.club_id, old.profile_id);
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if old.club_id is distinct from new.club_id
       or old.profile_id is distinct from new.profile_id then
      perform public.repair_club_membership_state(old.club_id, old.profile_id);
    end if;
  end if;

  perform public.repair_club_membership_state(new.club_id, new.profile_id);
  return new;
end;
$$;

drop trigger if exists trg_age_group_staff_sync_club_membership on public.age_group_staff;
create trigger trg_age_group_staff_sync_club_membership
after insert or update or delete
on public.age_group_staff
for each row
execute function public.age_group_staff_sync_club_membership();

create or replace function public.normalize_team_staff_role_v2()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.role = 'head_coach' then
    new.role := 'coach';
  elsif new.role = 'coordinator' then
    new.role := 'coach';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_team_staff_normalize_role_v2 on public.team_staff;
create trigger trg_team_staff_normalize_role_v2
before insert or update of role
on public.team_staff
for each row
execute function public.normalize_team_staff_role_v2();

alter table public.team_staff
  drop constraint if exists team_staff_role_check;

delete from public.team_staff ts
using public.teams t,
      public.age_groups ag
where ts.team_id = t.id
  and t.age_group_id = ag.id
  and ts.profile_id = ag.coordinator_id;

update public.team_staff
set role = 'coach'
where role in ('head_coach', 'coordinator');

alter table public.team_staff
  add constraint team_staff_role_check
  check (role in ('coach', 'assistant_coach'));

insert into public.age_group_staff (
  age_group_id,
  club_id,
  profile_id,
  linked_team_id,
  role,
  created_at,
  updated_at
)
select
  ranked.age_group_id,
  ranked.club_id,
  ranked.profile_id,
  ranked.linked_team_id,
  ranked.role,
  ranked.created_at,
  ranked.created_at
from (
  select
    t.age_group_id,
    t.club_id,
    ts.profile_id,
    ts.team_id as linked_team_id,
    case
      when ts.role in ('coach', 'head_coach', 'coordinator') then 'coach'
      else 'assistant_coach'
    end as role,
    coalesce(ts.created_at, now()) as created_at,
    row_number() over (
      partition by t.age_group_id, ts.profile_id
      order by
        case
          when ts.role in ('coach', 'head_coach', 'coordinator') then 0
          else 1
        end,
        ts.created_at asc nulls last,
        ts.id asc
    ) as row_num
  from public.team_staff ts
  join public.teams t
    on t.id = ts.team_id
  left join public.age_groups ag
    on ag.id = t.age_group_id
  where ts.profile_id is not null
    and t.age_group_id is not null
    and ts.role in ('coach', 'head_coach', 'assistant_coach', 'coordinator')
    and ts.profile_id is distinct from ag.coordinator_id
) ranked
where ranked.row_num = 1
on conflict (age_group_id, profile_id)
do update set
  club_id = excluded.club_id,
  linked_team_id = excluded.linked_team_id,
  role = excluded.role,
  updated_at = now();

create or replace function public.sync_age_group_staff_to_team_staff()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_age_group_id uuid;
  v_profile_id uuid;
  v_keep_team_id uuid;
begin
  if pg_trigger_depth() > 1 then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    v_age_group_id := old.age_group_id;
    v_profile_id := old.profile_id;
    v_keep_team_id := null;
  else
    if tg_op = 'UPDATE'
       and (
         old.age_group_id is distinct from new.age_group_id
         or old.profile_id is distinct from new.profile_id
       ) then
      delete from public.team_staff ts
      using public.teams t
      where ts.team_id = t.id
        and t.age_group_id = old.age_group_id
        and ts.profile_id = old.profile_id;
    end if;

    v_age_group_id := new.age_group_id;
    v_profile_id := new.profile_id;
    v_keep_team_id := coalesce(new.linked_team_id, public.resolve_age_group_primary_team_id(new.age_group_id));
  end if;

  delete from public.team_staff ts
  using public.teams t
  where ts.team_id = t.id
    and t.age_group_id = v_age_group_id
    and ts.profile_id = v_profile_id
    and (
      v_keep_team_id is null
      or ts.team_id is distinct from v_keep_team_id
    );

  if tg_op <> 'DELETE' and v_keep_team_id is not null then
    insert into public.team_staff (
      profile_id,
      team_id,
      club_id,
      role
    )
    values (
      new.profile_id,
      v_keep_team_id,
      new.club_id,
      new.role
    )
    on conflict (team_id, profile_id)
    do update set
      club_id = excluded.club_id,
      role = excluded.role;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_age_group_staff_sync_team_staff on public.age_group_staff;
create trigger trg_age_group_staff_sync_team_staff
after insert or update or delete
on public.age_group_staff
for each row
execute function public.sync_age_group_staff_to_team_staff();

create or replace function public.sync_team_staff_to_age_group_staff()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_age_group_id uuid;
  v_club_id uuid;
  v_coordinator_id uuid;
  v_role text;
begin
  if pg_trigger_depth() > 1 then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    select t.age_group_id
      into v_age_group_id
    from public.teams t
    where t.id = old.team_id;

    if v_age_group_id is null then
      return old;
    end if;

    with replacement as (
      select
        t.age_group_id,
        t.club_id,
        ts.profile_id,
        ts.team_id as linked_team_id,
        case
          when ts.role in ('coach', 'head_coach', 'coordinator') then 'coach'
          when ts.role = 'assistant_coach' then 'assistant_coach'
          else null
        end as role
      from public.team_staff ts
      join public.teams t
        on t.id = ts.team_id
      where ts.profile_id = old.profile_id
        and t.age_group_id = v_age_group_id
        and ts.id <> old.id
        and ts.role in ('coach', 'head_coach', 'assistant_coach', 'coordinator')
      order by
        case
          when ts.role in ('coach', 'head_coach', 'coordinator') then 0
          else 1
        end,
        ts.created_at asc nulls last,
        ts.id asc
      limit 1
    )
    insert into public.age_group_staff (
      age_group_id,
      club_id,
      profile_id,
      linked_team_id,
      role
    )
    select
      replacement.age_group_id,
      replacement.club_id,
      replacement.profile_id,
      replacement.linked_team_id,
      replacement.role
    from replacement
    where replacement.role is not null
    on conflict (age_group_id, profile_id)
    do update set
      club_id = excluded.club_id,
      linked_team_id = excluded.linked_team_id,
      role = excluded.role,
      updated_at = now();

    if not exists (
      select 1
      from public.team_staff ts
      join public.teams t
        on t.id = ts.team_id
      where ts.profile_id = old.profile_id
        and t.age_group_id = v_age_group_id
        and ts.role in ('coach', 'head_coach', 'assistant_coach', 'coordinator')
    ) then
      delete from public.age_group_staff ags
      where ags.age_group_id = v_age_group_id
        and ags.profile_id = old.profile_id;
    end if;

    return old;
  end if;

  select
    t.age_group_id,
    t.club_id
  into
    v_age_group_id,
    v_club_id
  from public.teams t
  where t.id = new.team_id;

  if v_age_group_id is null then
    return new;
  end if;

  v_role :=
    case
      when new.role in ('coach', 'head_coach', 'coordinator') then 'coach'
      when new.role = 'assistant_coach' then 'assistant_coach'
      else null
    end;

  if v_role is null then
    return new;
  end if;

  select ag.coordinator_id
    into v_coordinator_id
  from public.age_groups ag
  where ag.id = v_age_group_id;

  if new.profile_id is not distinct from v_coordinator_id then
    delete from public.age_group_staff ags
    where ags.age_group_id = v_age_group_id
      and ags.profile_id = new.profile_id;
    return new;
  end if;

  insert into public.age_group_staff (
    age_group_id,
    club_id,
    profile_id,
    linked_team_id,
    role
  )
  values (
    v_age_group_id,
    v_club_id,
    new.profile_id,
    new.team_id,
    v_role
  )
  on conflict (age_group_id, profile_id)
  do update set
    club_id = excluded.club_id,
    linked_team_id = excluded.linked_team_id,
    role = excluded.role,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists trg_team_staff_sync_age_group_staff on public.team_staff;
create trigger trg_team_staff_sync_age_group_staff
after insert or update or delete
on public.team_staff
for each row
execute function public.sync_team_staff_to_age_group_staff();

drop trigger if exists trg_team_staff_sync_club_membership on public.team_staff;

insert into public.club_memberships (club_id, profile_id, role)
select distinct
  ag.club_id,
  ag.coordinator_id,
  'coordinator'
from public.age_groups ag
where ag.club_id is not null
  and ag.coordinator_id is not null
on conflict (club_id, profile_id)
do update set role =
  case
    when public.club_memberships.role in ('owner', 'admin') then public.club_memberships.role
    else 'coordinator'
  end;

insert into public.club_memberships (club_id, profile_id, role)
select distinct
  ags.club_id,
  ags.profile_id,
  'staff'
from public.age_group_staff ags
where ags.club_id is not null
  and ags.profile_id is not null
on conflict (club_id, profile_id)
do update set role =
  case
    when public.club_memberships.role in ('owner', 'admin') then public.club_memberships.role
    when exists (
      select 1
      from public.age_groups ag
      where ag.club_id = excluded.club_id
        and ag.coordinator_id = excluded.profile_id
    ) then 'coordinator'
    else 'staff'
  end;

update public.club_memberships cm
set role =
  case
    when exists (
      select 1
      from public.age_groups ag
      where ag.club_id = cm.club_id
        and ag.coordinator_id = cm.profile_id
    ) then 'coordinator'
    else 'staff'
  end
where cm.role not in ('owner', 'admin')
  and (
    exists (
      select 1
      from public.age_groups ag
      where ag.club_id = cm.club_id
        and ag.coordinator_id = cm.profile_id
    )
    or exists (
      select 1
      from public.age_group_staff ags
      where ags.club_id = cm.club_id
        and ags.profile_id = cm.profile_id
    )
  );

delete from public.club_memberships cm
where cm.role not in ('owner', 'admin')
  and not exists (
    select 1
    from public.age_groups ag
    where ag.club_id = cm.club_id
      and ag.coordinator_id = cm.profile_id
  )
  and not exists (
    select 1
    from public.age_group_staff ags
    where ags.club_id = cm.club_id
      and ags.profile_id = cm.profile_id
  );

create or replace function public.user_can_access_team(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.teams t
    where t.id = p_team_id
      and public.user_can_access_club(t.club_id)
      and (
        exists (
          select 1
          from public.age_group_staff ags
          where ags.profile_id = auth.uid()
            and ags.linked_team_id = t.id
        )
        or exists (
          select 1
          from public.age_groups ag
          where ag.id = t.age_group_id
            and ag.coordinator_id = auth.uid()
        )
      )
  );
$$;

create or replace function public.user_can_access_age_group(p_age_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.age_groups ag
    where ag.id = p_age_group_id
      and public.user_can_access_club(ag.club_id)
      and (
        ag.coordinator_id = auth.uid()
        or exists (
          select 1
          from public.age_group_staff ags
          where ags.age_group_id = ag.id
            and ags.profile_id = auth.uid()
        )
      )
  );
$$;

create or replace function public.age_group_technical_staff_usage(
  p_age_group_id uuid,
  p_exclude_pending_invite_id uuid default null
)
returns table (
  coordinator_id uuid,
  active_technical_staff_count integer,
  pending_technical_invite_count integer
)
language sql
stable
security definer
set search_path = public
as $$
  with age_group_row as (
    select ag.id, ag.coordinator_id
    from public.age_groups ag
    where ag.id = p_age_group_id
  ),
  active_staff as (
    select count(distinct ags.profile_id)::integer as count_value
    from public.age_group_staff ags
    join age_group_row ag
      on ag.id = ags.age_group_id
    where ags.role in ('coach', 'assistant_coach')
      and ags.profile_id is distinct from ag.coordinator_id
  ),
  pending_invites as (
    select count(*)::integer as count_value
    from public.staff_invites si
    where si.age_group_id = p_age_group_id
      and si.accepted_at is null
      and si.role in ('coach', 'assistant_coach')
      and (
        p_exclude_pending_invite_id is null
        or si.id <> p_exclude_pending_invite_id
      )
  )
  select
    ag.coordinator_id,
    coalesce(active_staff.count_value, 0) as active_technical_staff_count,
    coalesce(pending_invites.count_value, 0) as pending_technical_invite_count
  from age_group_row ag
  cross join active_staff
  cross join pending_invites;
$$;

create or replace function public.enforce_age_group_staff_technical_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_consumes_slot boolean := false;
  v_new_consumes_slot boolean := false;
  v_pending_invite_id_text text := nullif(
    current_setting('coach11.current_staff_invite_id', true),
    ''
  );
  v_pending_invite_id uuid := null;
begin
  if tg_op = 'UPDATE' then
    v_old_consumes_slot := old.role in ('coach', 'assistant_coach');
  end if;

  v_new_consumes_slot := new.role in ('coach', 'assistant_coach');

  if not v_new_consumes_slot then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and v_old_consumes_slot
     and old.age_group_id is not distinct from new.age_group_id then
    return new;
  end if;

  if v_pending_invite_id_text is not null then
    begin
      v_pending_invite_id := v_pending_invite_id_text::uuid;
    exception
      when others then
        v_pending_invite_id := null;
    end;
  end if;

  perform public.assert_age_group_technical_staff_limit(
    new.age_group_id,
    v_pending_invite_id
  );
  return new;
end;
$$;

drop trigger if exists trg_age_group_staff_limit_technical_staff on public.age_group_staff;
create trigger trg_age_group_staff_limit_technical_staff
before insert or update of age_group_id, profile_id, role
on public.age_group_staff
for each row
execute function public.enforce_age_group_staff_technical_limit();

create or replace function public.enforce_team_staff_technical_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_age_group_id uuid := null;
  v_new_age_group_id uuid := null;
  v_old_coordinator_id uuid := null;
  v_new_coordinator_id uuid := null;
  v_old_consumes_slot boolean := false;
  v_new_consumes_slot boolean := false;
  v_pending_invite_id_text text := nullif(
    current_setting('coach11.current_staff_invite_id', true),
    ''
  );
  v_pending_invite_id uuid := null;
begin
  select t.age_group_id
    into v_new_age_group_id
  from public.teams t
  where t.id = new.team_id;

  if v_new_age_group_id is null then
    return new;
  end if;

  select ag.coordinator_id
    into v_new_coordinator_id
  from public.age_groups ag
  where ag.id = v_new_age_group_id;

  v_new_consumes_slot :=
    new.role in ('coach', 'head_coach', 'assistant_coach')
    and new.profile_id is distinct from v_new_coordinator_id;

  if not v_new_consumes_slot then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    select t.age_group_id
      into v_old_age_group_id
    from public.teams t
    where t.id = old.team_id;

    if v_old_age_group_id is not null then
      select ag.coordinator_id
        into v_old_coordinator_id
      from public.age_groups ag
      where ag.id = v_old_age_group_id;
    end if;

    v_old_consumes_slot :=
      old.role in ('coach', 'head_coach', 'assistant_coach')
      and old.profile_id is distinct from v_old_coordinator_id;

    if v_old_consumes_slot
       and v_old_age_group_id is not distinct from v_new_age_group_id then
      return new;
    end if;
  end if;

  if v_pending_invite_id_text is not null then
    begin
      v_pending_invite_id := v_pending_invite_id_text::uuid;
    exception
      when others then
        v_pending_invite_id := null;
    end;
  end if;

  perform public.assert_age_group_technical_staff_limit(
    v_new_age_group_id,
    v_pending_invite_id
  );
  return new;
end;
$$;

create or replace function public.rpc_redeem_staff_invite(
  p_invite_code text,
  p_user_id uuid,
  p_user_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := upper(trim(coalesce(p_invite_code, '')));
  v_user_email text := nullif(lower(trim(coalesce(p_user_email, ''))), '');
  v_invite public.staff_invites%rowtype;
  v_team_id uuid;
  v_invite_club_id uuid;
  v_age_group_name text;
  v_age_group_club_name text;
  v_profile_full_name text;
  v_profile_exists boolean := false;
  v_already_linked boolean := false;
  v_profile_role text;
begin
  if p_user_id is null then
    raise exception 'p_user_id e obrigatorio';
  end if;

  if v_code = '' then
    return jsonb_build_object('ok', false, 'error_code', 'invalid_code');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('redeem_staff_invite:' || v_code, 0));

  begin
    select si.*
      into v_invite
    from public.staff_invites si
    where upper(trim(si.invite_code)) = v_code
    limit 1
    for update;
  exception
    when others then
      return jsonb_build_object('ok', false, 'error_code', 'invite_lookup_failed');
  end;

  if v_invite.id is null then
    return jsonb_build_object('ok', false, 'error_code', 'invite_not_found');
  end if;

  if v_invite.email is not null
     and v_user_email is not null
     and lower(trim(v_invite.email)) <> v_user_email then
    return jsonb_build_object('ok', false, 'error_code', 'email_mismatch');
  end if;

  if v_invite.accepted_at is not null
     and v_invite.accepted_by is not null
     and v_invite.accepted_by <> p_user_id
     and not (
       v_invite.email is not null
       and v_user_email is not null
       and lower(trim(v_invite.email)) = v_user_email
     ) then
    return jsonb_build_object('ok', false, 'error_code', 'invite_used_by_other');
  end if;

  v_invite_club_id := v_invite.club_id;

  if v_invite_club_id is null then
    select ag.club_id
      into v_invite_club_id
    from public.age_groups ag
    where ag.id = v_invite.age_group_id
    limit 1;
  end if;

  if v_invite_club_id is not null and exists (
    select 1
    from public.club_memberships cm
    where cm.profile_id = p_user_id
      and cm.club_id is distinct from v_invite_club_id
  ) then
    return jsonb_build_object('ok', false, 'error_code', 'cross_club_forbidden');
  end if;

  select ag.name, ag.club_name
    into v_age_group_name, v_age_group_club_name
  from public.age_groups ag
  where ag.id = v_invite.age_group_id
  limit 1;

  if v_age_group_name is null then
    return jsonb_build_object('ok', false, 'error_code', 'age_group_not_found');
  end if;

  select t.id
    into v_team_id
  from public.teams t
  where t.age_group_id = v_invite.age_group_id
  order by t.created_at asc nulls last, t.id asc
  limit 1;

  if v_team_id is null then
    begin
      insert into public.teams (
        age_group_id,
        name,
        is_competitive
      )
      values (
        v_invite.age_group_id,
        trim(coalesce(v_age_group_club_name, '') || ' ' || coalesce(v_age_group_name, '')),
        true
      )
      returning id into v_team_id;
    exception
      when others then
        return jsonb_build_object('ok', false, 'error_code', 'team_create_failed');
    end;
  end if;

  select p.full_name
    into v_profile_full_name
  from public.profiles p
  where p.id = p_user_id
  limit 1;

  v_profile_exists := found;
  v_profile_role := case when v_invite.role = 'coordinator' then 'coordinator' else 'coach' end;

  if not v_profile_exists then
    begin
      insert into public.profiles (
        id,
        full_name,
        role
      )
      values (
        p_user_id,
        coalesce(
          nullif(trim(coalesce(v_invite.first_name, '') || ' ' || coalesce(v_invite.last_name, '')), ''),
          nullif(split_part(coalesce(v_user_email, ''), '@', 1), ''),
          'Utilizador'
        ),
        v_profile_role
      );
    exception
      when others then
        update public.profiles
        set role = v_profile_role
        where id = p_user_id;
    end;
  else
    update public.profiles
    set role = v_profile_role
    where id = p_user_id;
  end if;

  if v_profile_exists
     and coalesce(nullif(trim(v_profile_full_name), ''), '') = ''
     and v_invite.first_name is not null then
    update public.profiles
    set full_name = nullif(
      trim(coalesce(v_invite.first_name, '') || ' ' || coalesce(v_invite.last_name, '')),
      ''
    )
    where id = p_user_id;
  end if;

  select exists (
    select 1
    from public.age_group_staff ags
    where ags.profile_id = p_user_id
      and ags.age_group_id = v_invite.age_group_id
  )
  into v_already_linked;

  if not v_already_linked then
    begin
      perform set_config('coach11.current_staff_invite_id', v_invite.id::text, true);

      insert into public.age_group_staff (
        age_group_id,
        club_id,
        profile_id,
        linked_team_id,
        role
      )
      values (
        v_invite.age_group_id,
        coalesce(v_invite.club_id, v_invite_club_id),
        p_user_id,
        v_team_id,
        v_invite.role
      );
    exception
      when unique_violation then
        v_already_linked := true;
      when others then
        if SQLERRM = 'technical_staff_limit_reached' then
          return jsonb_build_object('ok', false, 'error_code', 'technical_staff_limit_reached');
        end if;

        return jsonb_build_object('ok', false, 'error_code', 'team_staff_insert_failed');
    end;
  end if;

  update public.staff_invites
  set
    accepted_at = now(),
    accepted_by = p_user_id,
    status = 'accepted'
  where id = v_invite.id;

  return jsonb_build_object(
    'ok', true,
    'already_linked', v_already_linked,
    'role', v_invite.role,
    'age_group_name', v_age_group_name,
    'age_group_club_name', v_age_group_club_name
  );
end;
$$;

alter table public.age_group_staff enable row level security;

drop policy if exists age_group_staff_club_boundary_v1 on public.age_group_staff;
create policy age_group_staff_club_boundary_v1
on public.age_group_staff
as restrictive
for all
using (public.user_can_access_club(club_id))
with check (public.user_can_access_club(club_id));

drop policy if exists age_group_staff_select_v1 on public.age_group_staff;
create policy age_group_staff_select_v1
on public.age_group_staff
for select
using (
  profile_id = auth.uid()
  or public.user_can_access_age_group(age_group_id)
);

drop policy if exists age_group_staff_coordinator_insert_v1 on public.age_group_staff;
create policy age_group_staff_coordinator_insert_v1
on public.age_group_staff
for insert
with check (
  public.user_is_age_group_coordinator(age_group_id)
  and exists (
    select 1
    from public.age_groups ag
    where ag.id = age_group_staff.age_group_id
      and ag.club_id = age_group_staff.club_id
  )
);

drop policy if exists age_group_staff_coordinator_update_v1 on public.age_group_staff;
create policy age_group_staff_coordinator_update_v1
on public.age_group_staff
for update
using (public.user_is_age_group_coordinator(age_group_id))
with check (
  public.user_is_age_group_coordinator(age_group_id)
  and exists (
    select 1
    from public.age_groups ag
    where ag.id = age_group_staff.age_group_id
      and ag.club_id = age_group_staff.club_id
  )
);

drop policy if exists age_group_staff_coordinator_delete_v1 on public.age_group_staff;
create policy age_group_staff_coordinator_delete_v1
on public.age_group_staff
for delete
using (public.user_is_age_group_coordinator(age_group_id));

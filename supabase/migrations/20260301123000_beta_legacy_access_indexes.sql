create index if not exists age_groups_coordinator_id_idx
  on public.age_groups(coordinator_id);

create index if not exists team_staff_profile_id_idx
  on public.team_staff(profile_id);

update public.profiles as p
set email = lower(trim(u.email))
from auth.users as u
where u.id = p.id
  and u.email is not null
  and (
    p.email is null
    or p.email <> lower(trim(u.email))
  );

update public.profiles
set is_super_coordinator = true
where lower(coalesce(email, '')) = 'pedrohmscampos@gmail.com';

update public.profiles
set is_super_coordinator = false
where lower(coalesce(email, '')) <> 'pedrohmscampos@gmail.com'
  and is_super_coordinator = true;

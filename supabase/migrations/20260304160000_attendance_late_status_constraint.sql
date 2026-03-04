do $$
begin
  if to_regclass('public.training_attendance') is not null then
    execute 'alter table public.training_attendance drop constraint if exists training_attendance_status_check';
    execute $sql$
      alter table public.training_attendance
      add constraint training_attendance_status_check
      check (status in ('present', 'late', 'absent', 'injured'))
    $sql$;
  end if;

  if to_regclass('public.attendance_records') is not null then
    execute 'alter table public.attendance_records drop constraint if exists attendance_records_status_check';
    execute $sql$
      alter table public.attendance_records
      add constraint attendance_records_status_check
      check (status in ('present', 'late', 'absent', 'injured'))
    $sql$;
  end if;
end $$;

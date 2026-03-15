-- Adicionar política permissiva de SELECT à tabela training_attendance.
-- A tabela tinha apenas políticas RESTRICTIVE mas nenhuma PERMISSIVE para SELECT,
-- pelo que queries de cliente JS retornavam 0 linhas silenciosamente.
-- API routes e RPCs funcionavam porque usam createAdminClient() / security definer.
-- Esta policy usa a mesma função de autorização já usada pelas políticas restritivas.

do $$
begin
  if to_regclass('public.training_attendance') is not null then
    execute 'drop policy if exists training_attendance_staff_select_v1 on public.training_attendance';
    execute $pol$
      create policy training_attendance_staff_select_v1
      on public.training_attendance
      for select
      to authenticated
      using (
        training_session_id is not null
        and public.user_can_access_training_session_v2(training_session_id)
      )
    $pol$;
  end if;
end;
$$;

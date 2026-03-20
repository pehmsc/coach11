-- Fix: training_attendance tinha só SELECT policy permissiva.
-- INSERT/UPDATE/DELETE bloqueados pela restrictive sem permissive correspondente.
-- Resultado: upsert de presenças falhava com "attendance.upsert.failed".

DO $$
BEGIN
  IF to_regclass('public.training_attendance') IS NOT NULL THEN
    -- INSERT
    EXECUTE 'DROP POLICY IF EXISTS training_attendance_staff_insert_v1 ON public.training_attendance';
    EXECUTE $pol$
      CREATE POLICY training_attendance_staff_insert_v1
      ON public.training_attendance
      FOR INSERT
      TO authenticated
      WITH CHECK (
        training_session_id IS NOT NULL
        AND public.user_can_access_training_session_v2(training_session_id)
      )
    $pol$;

    -- UPDATE
    EXECUTE 'DROP POLICY IF EXISTS training_attendance_staff_update_v1 ON public.training_attendance';
    EXECUTE $pol$
      CREATE POLICY training_attendance_staff_update_v1
      ON public.training_attendance
      FOR UPDATE
      TO authenticated
      USING (
        training_session_id IS NOT NULL
        AND public.user_can_access_training_session_v2(training_session_id)
      )
      WITH CHECK (
        training_session_id IS NOT NULL
        AND public.user_can_access_training_session_v2(training_session_id)
      )
    $pol$;

    -- DELETE
    EXECUTE 'DROP POLICY IF EXISTS training_attendance_staff_delete_v1 ON public.training_attendance';
    EXECUTE $pol$
      CREATE POLICY training_attendance_staff_delete_v1
      ON public.training_attendance
      FOR DELETE
      TO authenticated
      USING (
        training_session_id IS NOT NULL
        AND public.user_can_access_training_session_v2(training_session_id)
      )
    $pol$;
  END IF;
END;
$$;

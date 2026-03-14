-- Limpeza: attendance_records é legacy, substituída por training_attendance
-- A tabela activa é training_attendance (usada por toda a API de presenças desde Jan 2026).
-- Safety: renomear em vez de drop. Remover completamente no próximo sprint após confirmação em produção.

ALTER TABLE IF EXISTS public.attendance_records
  RENAME TO attendance_records_deprecated;

COMMENT ON TABLE public.attendance_records_deprecated IS
  'DEPRECATED: Usar training_attendance. Mantida temporariamente como safety net. Remover após confirmar que não há dados relevantes em produção.';

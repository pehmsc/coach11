-- Permitir auth.admin.deleteUser() apagar uma conta sem ficar bloqueado por FKs
-- de autoria (created_by / uploaded_by / promoted_by / corrected_by / accepted_by
-- / updated_by / marked_by / profile_id / created_by_profile_id).
--
-- Decisao: eliminar um membro do clube apaga a conta por completo (auth.users +
-- profiles + memberships + staff + convites em cascata). O conteudo criado pelo
-- treinador (exercicios, microciclos, observacoes, fichas, etc.) preserva-se,
-- perdendo apenas o autor (campo passa a NULL).
--
-- Inclui:
--   - 10 FKs publicas -> auth.users com NO ACTION -> ON DELETE SET NULL
--   - 6 FKs publicas -> public.profiles com NO ACTION/RESTRICT -> ON DELETE SET NULL
--     (sem isto o cascata profiles->auth.users falha a meio)
--   - 8 colunas NOT NULL passam a NULLABLE para SET NULL ter efeito

-- =========================================================================
-- Parte A: tornar colunas NULLABLE (pre-requisito do SET NULL ter efeito)
-- =========================================================================

ALTER TABLE public.exercises ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE public.microciclos ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE public.player_behavioral_assessments ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE public.player_documents ALTER COLUMN uploaded_by DROP NOT NULL;
ALTER TABLE public.player_registrations ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE public.season_objectives ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE public.beta_invites ALTER COLUMN created_by_profile_id DROP NOT NULL;
ALTER TABLE public.public_share_tokens ALTER COLUMN created_by DROP NOT NULL;

-- =========================================================================
-- Parte B: 10 FKs -> auth.users (NO ACTION -> SET NULL)
-- =========================================================================

ALTER TABLE public.staff_invites DROP CONSTRAINT staff_invites_accepted_by_fkey;
ALTER TABLE public.staff_invites ADD CONSTRAINT staff_invites_accepted_by_fkey
  FOREIGN KEY (accepted_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.exercises DROP CONSTRAINT exercises_created_by_fkey;
ALTER TABLE public.exercises ADD CONSTRAINT exercises_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.game_opponent_observations DROP CONSTRAINT game_opponent_observations_created_by_fkey;
ALTER TABLE public.game_opponent_observations ADD CONSTRAINT game_opponent_observations_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.game_opponent_observations DROP CONSTRAINT game_opponent_observations_promoted_by_fkey;
ALTER TABLE public.game_opponent_observations ADD CONSTRAINT game_opponent_observations_promoted_by_fkey
  FOREIGN KEY (promoted_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.lineup_corrections_log DROP CONSTRAINT lineup_corrections_log_corrected_by_fkey;
ALTER TABLE public.lineup_corrections_log ADD CONSTRAINT lineup_corrections_log_corrected_by_fkey
  FOREIGN KEY (corrected_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.microciclos DROP CONSTRAINT microciclos_created_by_fkey;
ALTER TABLE public.microciclos ADD CONSTRAINT microciclos_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.player_behavioral_assessments DROP CONSTRAINT player_behavioral_assessments_created_by_fkey;
ALTER TABLE public.player_behavioral_assessments ADD CONSTRAINT player_behavioral_assessments_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.player_documents DROP CONSTRAINT player_documents_uploaded_by_fkey;
ALTER TABLE public.player_documents ADD CONSTRAINT player_documents_uploaded_by_fkey
  FOREIGN KEY (uploaded_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.player_registrations DROP CONSTRAINT player_registrations_created_by_fkey;
ALTER TABLE public.player_registrations ADD CONSTRAINT player_registrations_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.season_objectives DROP CONSTRAINT season_objectives_created_by_fkey;
ALTER TABLE public.season_objectives ADD CONSTRAINT season_objectives_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- =========================================================================
-- Parte C: 6 FKs -> public.profiles (NO ACTION/RESTRICT -> SET NULL)
-- Necessario para o cascata profiles->auth.users nao ficar bloqueado.
-- =========================================================================

ALTER TABLE public.game_live_checkpoints DROP CONSTRAINT game_live_checkpoints_updated_by_fkey;
ALTER TABLE public.game_live_checkpoints ADD CONSTRAINT game_live_checkpoints_updated_by_fkey
  FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.grounds DROP CONSTRAINT grounds_created_by_fkey;
ALTER TABLE public.grounds ADD CONSTRAINT grounds_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.players DROP CONSTRAINT players_profile_id_fkey;
ALTER TABLE public.players ADD CONSTRAINT players_profile_id_fkey
  FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.training_attendance DROP CONSTRAINT training_attendance_marked_by_fkey;
ALTER TABLE public.training_attendance ADD CONSTRAINT training_attendance_marked_by_fkey
  FOREIGN KEY (marked_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.beta_invites DROP CONSTRAINT beta_invites_created_by_profile_id_fkey;
ALTER TABLE public.beta_invites ADD CONSTRAINT beta_invites_created_by_profile_id_fkey
  FOREIGN KEY (created_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.public_share_tokens DROP CONSTRAINT public_share_tokens_created_by_fkey;
ALTER TABLE public.public_share_tokens ADD CONSTRAINT public_share_tokens_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

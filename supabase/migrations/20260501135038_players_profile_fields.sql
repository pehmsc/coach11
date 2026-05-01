-- PR 1/3 da página de detalhe do atleta — colunas novas em players para
-- suportar contactos do encarregado, observações, consentimento de foto
-- (RGPD) e auditoria de updated_at.
--
-- Reutiliza a função public.set_updated_at() já criada em
-- 20260314140000_staff_permissions.sql.

ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS photo_consent_given boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS parent_email text,
  ADD COLUMN IF NOT EXISTS parent_phone text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

COMMENT ON COLUMN public.players.photo_consent_given IS
  'Flag de consentimento RGPD para apresentação da foto. UI de recolha entra em sprint futura — esta sprint apenas regista o flag.';

COMMENT ON COLUMN public.players.notes IS
  'Observações livres do staff técnico sobre o atleta. Texto livre, sem limite enforced no DB (limite no Zod).';

COMMENT ON COLUMN public.players.parent_email IS
  'Contacto de email do encarregado de educação. Sem CHECK de formato no DB — validação aplicacional.';

COMMENT ON COLUMN public.players.parent_phone IS
  'Contacto telefónico do encarregado de educação. Sem CHECK de formato no DB — validação aplicacional.';

DROP TRIGGER IF EXISTS players_set_updated_at ON public.players;
CREATE TRIGGER players_set_updated_at
  BEFORE UPDATE ON public.players
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

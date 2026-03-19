-- Migration 6: Verificar e documentar roles de club_memberships
-- Não altera dados — apenas garante que a constraint aceita os roles necessários.

-- Remover constraint existente (se existir) e adicionar com todos os roles
DO $$
DECLARE
  cname text;
BEGIN
  -- Encontrar e remover qualquer CHECK constraint no campo role
  FOR cname IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY(con.conkey)
    WHERE con.conrelid = 'public.club_memberships'::regclass
      AND con.contype = 'c'
      AND att.attname = 'role'
  LOOP
    EXECUTE format('ALTER TABLE public.club_memberships DROP CONSTRAINT IF EXISTS %I', cname);
  END LOOP;
END $$;

ALTER TABLE club_memberships
  ADD CONSTRAINT club_memberships_role_check
  CHECK (role IN ('coordinator', 'club_coordinator', 'club_admin', 'staff'));

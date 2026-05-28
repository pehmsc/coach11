-- Adiciona p_plan_type ao RPC de onboarding para suportar treinador individual.
--
-- Bug: create_club_onboarding() so inseria name/short_name/slug/logo_url, deixando
-- plan_type e tier com os defaults da coluna ('club' / 'standard'). Resultado:
-- treinadores individuais (que vinham de /precos?plan=individual) ficavam com
-- clube 'club' e nunca chegavam ao Stripe Checkout.
--
-- Agora a funcao aceita p_plan_type ('individual' ou 'club', default 'club' para
-- retrocompatibilidade) e define plan_type + tier coerente:
--   individual -> plan_type='individual', tier='individual'
--   club       -> plan_type='club',       tier='standard'
--
-- CLAUDE.md: CREATE OR REPLACE nao substitui quando a assinatura muda — DROP primeiro.

drop function if exists public.create_club_onboarding(text, text, text, text);

create or replace function public.create_club_onboarding(
  p_name text,
  p_short_name text default null,
  p_slug text default 'clube',
  p_logo_url text default null,
  p_plan_type text default 'club'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_club_id uuid;
  v_final_slug text;
  v_attempt int := 0;
  v_plan_type text;
  v_tier text;
begin
  -- Verificar autenticacao
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  -- Normalizar plan_type (default seguro 'club')
  v_plan_type := case when p_plan_type = 'individual' then 'individual' else 'club' end;
  v_tier := case when v_plan_type = 'individual' then 'individual' else 'standard' end;

  -- Idempotencia: se ja tem clube, retornar o existente
  select cm.club_id into v_club_id
  from public.club_memberships cm
  where cm.profile_id = v_uid
  order by cm.created_at asc
  limit 1;

  if v_club_id is not null then
    return jsonb_build_object('club_id', v_club_id, 'already_existed', true);
  end if;

  -- Gerar slug unico com retry
  v_final_slug := coalesce(nullif(trim(p_slug), ''), 'clube');
  while v_attempt < 10 loop
    begin
      insert into public.clubs (name, short_name, slug, logo_url, plan_type, tier)
      values (
        trim(p_name),
        nullif(trim(coalesce(p_short_name, '')), ''),
        case when v_attempt = 0 then v_final_slug
             else v_final_slug || '-' || v_attempt
        end,
        nullif(trim(coalesce(p_logo_url, '')), ''),
        v_plan_type,
        v_tier
      )
      returning id into v_club_id;
      exit; -- sucesso
    exception when unique_violation then
      v_attempt := v_attempt + 1;
    end;
  end loop;

  if v_club_id is null then
    raise exception 'slug_conflict';
  end if;

  -- Criar membership de coordenador de clube
  insert into public.club_memberships (club_id, profile_id, role)
  values (v_club_id, v_uid, 'club_coordinator');

  return jsonb_build_object(
    'club_id', v_club_id,
    'already_existed', false,
    'plan_type', v_plan_type
  );
end;
$$;

revoke all on function public.create_club_onboarding from public;
revoke all on function public.create_club_onboarding from anon;
grant execute on function public.create_club_onboarding to authenticated;

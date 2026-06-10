-- PERF (a)+(b) da auditoria 2026-06-10: advisors auth_rls_initplan e
-- multiple_permissive_policies.
--
-- (a) initplan: expressoes auth.uid()/auth.role()/auth.jwt() embrulhadas em
--     (select ...) para serem avaliadas uma vez por query em vez de por linha.
-- (b) role scoping: policies com roles {public} passam a TO authenticated,
--     excepto as superficies publicas intencionais, que ficam intocadas:
--       - waitlist."Anyone can join waitlist" (INSERT anon da landing page)
--       - athlete_intake_submissions.intake_insert_public (INSERT publico)
--     (staff_invites.anyone_can_read_invite_by_code passa a TO authenticated:
--     o fluxo pre-login usa admin client e o redeem exige sessao — Fase 1.)
--
-- Geracao mecanica a partir de pg_policies: DROP + CREATE preservando
-- permissive/cmd/qual/with_check. Nenhuma alteracao semantica alem do wrap
-- e do scoping de roles.
--
-- FORA DESTA MIGRATION (guard sql-club-wrapper-usage): 11 policies cujos
-- quals usam os helpers legacy user_can_access_club/user_can_manage_club
-- nao podem aparecer em migrations novas. Ficam com initplan/anon por
-- corrigir ate ao decommission desses helpers:
--   club_memberships: admin_delete_v1, admin_insert_v1, admin_update_v1,
--     self_or_admin_select_v1
--   clubs: clubs_member_select_v1, clubs_member_update_v1
--   player_behavioral_assessments, player_documents, player_registrations,
--   season_objectives, training_phase_exercises: *_club_access

-- profiles: consolidacao aprovada das duas policies ALL duplicadas
-- ("Own profile" e "Users can view own profile", ambas auth.uid() = id)
-- numa unica policy com USING e WITH CHECK explicitos.
DROP POLICY IF EXISTS "Own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "profiles_own_all_v1" ON public.profiles
  FOR ALL TO authenticated
  USING ((select auth.uid()) = id)
  WITH CHECK ((select auth.uid()) = id);

DROP POLICY IF EXISTS "club_members_can_read_categories" ON public.age_group_categories;
CREATE POLICY "club_members_can_read_categories" ON public.age_group_categories
  FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM club_memberships
  WHERE ((club_memberships.club_id = age_group_categories.club_id) AND (club_memberships.profile_id = (select auth.uid()))))));

DROP POLICY IF EXISTS "age_group_staff_coordinator_delete_v1" ON public.age_group_staff;
CREATE POLICY "age_group_staff_coordinator_delete_v1" ON public.age_group_staff
  FOR DELETE TO authenticated
  USING (user_can_manage_age_group_v2(age_group_id));

DROP POLICY IF EXISTS "age_group_staff_coordinator_insert_v1" ON public.age_group_staff;
CREATE POLICY "age_group_staff_coordinator_insert_v1" ON public.age_group_staff
  FOR INSERT TO authenticated
  WITH CHECK ((user_can_manage_age_group_v2(age_group_id) AND (EXISTS ( SELECT 1
   FROM age_groups ag
  WHERE ((ag.id = age_group_staff.age_group_id) AND (ag.club_id = age_group_staff.club_id))))));

DROP POLICY IF EXISTS "age_group_staff_coordinator_update_v1" ON public.age_group_staff;
CREATE POLICY "age_group_staff_coordinator_update_v1" ON public.age_group_staff
  FOR UPDATE TO authenticated
  USING (user_can_manage_age_group_v2(age_group_id))
  WITH CHECK ((user_can_manage_age_group_v2(age_group_id) AND (EXISTS ( SELECT 1
   FROM age_groups ag
  WHERE ((ag.id = age_group_staff.age_group_id) AND (ag.club_id = age_group_staff.club_id))))));

DROP POLICY IF EXISTS "age_group_staff_domain_boundary_v2" ON public.age_group_staff;
CREATE POLICY "age_group_staff_domain_boundary_v2" ON public.age_group_staff AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (((profile_id = (select auth.uid())) OR user_can_access_age_group(age_group_id)))
  WITH CHECK ((user_can_manage_age_group_v2(age_group_id) AND (EXISTS ( SELECT 1
   FROM age_groups ag
  WHERE ((ag.id = age_group_staff.age_group_id) AND (ag.club_id = age_group_staff.club_id))))));

DROP POLICY IF EXISTS "age_group_staff_select_v1" ON public.age_group_staff;
CREATE POLICY "age_group_staff_select_v1" ON public.age_group_staff
  FOR SELECT TO authenticated
  USING (((profile_id = (select auth.uid())) OR user_can_access_age_group_v2(age_group_id)));

DROP POLICY IF EXISTS "Coordinators manage age groups" ON public.age_groups;
CREATE POLICY "Coordinators manage age groups" ON public.age_groups
  FOR ALL TO authenticated
  USING ((coordinator_id = (select auth.uid())));

DROP POLICY IF EXISTS "age_groups_club_delete_v1" ON public.age_groups;
CREATE POLICY "age_groups_club_delete_v1" ON public.age_groups
  FOR DELETE TO authenticated
  USING (user_can_manage_age_group_v2(id));

DROP POLICY IF EXISTS "age_groups_club_insert_v1" ON public.age_groups;
CREATE POLICY "age_groups_club_insert_v1" ON public.age_groups
  FOR INSERT TO authenticated
  WITH CHECK (((coordinator_id = (select auth.uid())) OR user_is_super_coordinator()));

DROP POLICY IF EXISTS "age_groups_club_select_v1" ON public.age_groups;
CREATE POLICY "age_groups_club_select_v1" ON public.age_groups
  FOR SELECT TO authenticated
  USING (user_can_access_age_group_v2(id));

DROP POLICY IF EXISTS "age_groups_club_update_v1" ON public.age_groups;
CREATE POLICY "age_groups_club_update_v1" ON public.age_groups
  FOR UPDATE TO authenticated
  USING (user_can_manage_age_group_v2(id))
  WITH CHECK (user_can_manage_age_group_v2(id));

DROP POLICY IF EXISTS "intake_select_auth" ON public.athlete_intake_submissions;
CREATE POLICY "intake_select_auth" ON public.athlete_intake_submissions
  FOR SELECT TO authenticated
  USING (((select auth.role()) = 'authenticated'::text));

DROP POLICY IF EXISTS "intake_update_auth" ON public.athlete_intake_submissions;
CREATE POLICY "intake_update_auth" ON public.athlete_intake_submissions
  FOR UPDATE TO authenticated
  USING (((select auth.role()) = 'authenticated'::text));

DROP POLICY IF EXISTS "club_memberships_own_select" ON public.club_memberships;
CREATE POLICY "club_memberships_own_select" ON public.club_memberships
  FOR SELECT TO authenticated
  USING ((profile_id = (select auth.uid())));

DROP POLICY IF EXISTS "club_admins_can_update" ON public.clubs;
CREATE POLICY "club_admins_can_update" ON public.clubs
  FOR UPDATE TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM club_memberships
  WHERE ((club_memberships.club_id = clubs.id) AND (club_memberships.profile_id = (select auth.uid())) AND (club_memberships.role = 'admin'::text)))));

DROP POLICY IF EXISTS "club_members_can_read" ON public.clubs;
CREATE POLICY "club_members_can_read" ON public.clubs
  FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM club_memberships
  WHERE ((club_memberships.club_id = clubs.id) AND (club_memberships.profile_id = (select auth.uid()))))));

DROP POLICY IF EXISTS "clubs_select_member" ON public.clubs;
CREATE POLICY "clubs_select_member" ON public.clubs
  FOR SELECT TO authenticated
  USING (((EXISTS ( SELECT 1
   FROM club_memberships cm
  WHERE ((cm.club_id = clubs.id) AND (cm.profile_id = (select auth.uid()))))) OR (EXISTS ( SELECT 1
   FROM age_groups ag
  WHERE ((ag.club_id = ag.id) AND (ag.coordinator_id = (select auth.uid())))))));

DROP POLICY IF EXISTS "Team access competitions" ON public.competitions;
CREATE POLICY "Team access competitions" ON public.competitions
  FOR ALL TO authenticated
  USING ((team_id IN ( SELECT t.id
   FROM (teams t
     JOIN age_groups ag ON ((ag.id = t.age_group_id)))
  WHERE (ag.coordinator_id = (select auth.uid())))));

DROP POLICY IF EXISTS "competitions_staff_delete_v1" ON public.competitions;
CREATE POLICY "competitions_staff_delete_v1" ON public.competitions
  FOR DELETE TO authenticated
  USING (user_can_access_team(team_id));

DROP POLICY IF EXISTS "competitions_staff_insert_v1" ON public.competitions;
CREATE POLICY "competitions_staff_insert_v1" ON public.competitions
  FOR INSERT TO authenticated
  WITH CHECK ((user_can_access_team(team_id) AND (EXISTS ( SELECT 1
   FROM teams t
  WHERE ((t.id = competitions.team_id) AND (t.club_id = competitions.club_id))))));

DROP POLICY IF EXISTS "competitions_staff_select_v1" ON public.competitions;
CREATE POLICY "competitions_staff_select_v1" ON public.competitions
  FOR SELECT TO authenticated
  USING (user_can_access_team(team_id));

DROP POLICY IF EXISTS "competitions_staff_update_v1" ON public.competitions;
CREATE POLICY "competitions_staff_update_v1" ON public.competitions
  FOR UPDATE TO authenticated
  USING (user_can_access_team(team_id))
  WITH CHECK ((user_can_access_team(team_id) AND (EXISTS ( SELECT 1
   FROM teams t
  WHERE ((t.id = competitions.team_id) AND (t.club_id = competitions.club_id))))));

DROP POLICY IF EXISTS "device_push_tokens_owner_delete_v1" ON public.device_push_tokens;
CREATE POLICY "device_push_tokens_owner_delete_v1" ON public.device_push_tokens
  FOR DELETE TO authenticated
  USING ((user_id = (select auth.uid())));

DROP POLICY IF EXISTS "device_push_tokens_owner_insert_v1" ON public.device_push_tokens;
CREATE POLICY "device_push_tokens_owner_insert_v1" ON public.device_push_tokens
  FOR INSERT TO authenticated
  WITH CHECK ((user_id = (select auth.uid())));

DROP POLICY IF EXISTS "device_push_tokens_owner_select_v1" ON public.device_push_tokens;
CREATE POLICY "device_push_tokens_owner_select_v1" ON public.device_push_tokens
  FOR SELECT TO authenticated
  USING ((user_id = (select auth.uid())));

DROP POLICY IF EXISTS "device_push_tokens_owner_update_v1" ON public.device_push_tokens;
CREATE POLICY "device_push_tokens_owner_update_v1" ON public.device_push_tokens
  FOR UPDATE TO authenticated
  USING ((user_id = (select auth.uid())))
  WITH CHECK ((user_id = (select auth.uid())));

DROP POLICY IF EXISTS "goo_delete_age_group_staff" ON public.game_opponent_observations;
CREATE POLICY "goo_delete_age_group_staff" ON public.game_opponent_observations
  FOR DELETE TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM games g
  WHERE ((g.id = game_opponent_observations.game_id) AND user_can_access_age_group(g.age_group_id)))));

DROP POLICY IF EXISTS "goo_insert_age_group_staff" ON public.game_opponent_observations;
CREATE POLICY "goo_insert_age_group_staff" ON public.game_opponent_observations
  FOR INSERT TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM games g
  WHERE ((g.id = game_opponent_observations.game_id) AND user_can_access_age_group(g.age_group_id)))));

DROP POLICY IF EXISTS "goo_select_age_group_staff" ON public.game_opponent_observations;
CREATE POLICY "goo_select_age_group_staff" ON public.game_opponent_observations
  FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM games g
  WHERE ((g.id = game_opponent_observations.game_id) AND user_can_access_age_group(g.age_group_id)))));

DROP POLICY IF EXISTS "goo_update_age_group_staff" ON public.game_opponent_observations;
CREATE POLICY "goo_update_age_group_staff" ON public.game_opponent_observations
  FOR UPDATE TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM games g
  WHERE ((g.id = game_opponent_observations.game_id) AND user_can_access_age_group(g.age_group_id)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM games g
  WHERE ((g.id = game_opponent_observations.game_id) AND user_can_access_age_group(g.age_group_id)))));

DROP POLICY IF EXISTS "Age group access games" ON public.games;
CREATE POLICY "Age group access games" ON public.games
  FOR ALL TO authenticated
  USING (((age_group_id IN ( SELECT age_groups.id
   FROM age_groups
  WHERE (age_groups.coordinator_id = (select auth.uid())))) OR (team_id IN ( SELECT t.id
   FROM (teams t
     JOIN age_groups ag ON ((ag.id = t.age_group_id)))
  WHERE (ag.coordinator_id = (select auth.uid()))))));

DROP POLICY IF EXISTS "Team access games" ON public.games;
CREATE POLICY "Team access games" ON public.games
  FOR ALL TO authenticated
  USING ((team_id IN ( SELECT t.id
   FROM (teams t
     JOIN age_groups ag ON ((ag.id = t.age_group_id)))
  WHERE (ag.coordinator_id = (select auth.uid())))))
  WITH CHECK ((team_id IN ( SELECT t.id
   FROM (teams t
     JOIN age_groups ag ON ((ag.id = t.age_group_id)))
  WHERE (ag.coordinator_id = (select auth.uid())))));

DROP POLICY IF EXISTS "invoices_club_manager_select" ON public.invoices;
CREATE POLICY "invoices_club_manager_select" ON public.invoices
  FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM club_memberships cm
  WHERE ((cm.club_id = invoices.club_id) AND (cm.profile_id = (select auth.uid())) AND (cm.role = ANY (ARRAY['owner'::text, 'admin'::text, 'coordinator'::text]))))));

DROP POLICY IF EXISTS "Team access kits" ON public.kit_pieces;
CREATE POLICY "Team access kits" ON public.kit_pieces
  FOR ALL TO authenticated
  USING ((team_id IN ( SELECT t.id
   FROM (teams t
     JOIN age_groups ag ON ((ag.id = t.age_group_id)))
  WHERE (ag.coordinator_id = (select auth.uid())))));

DROP POLICY IF EXISTS "kit_pieces_staff_delete_v1" ON public.kit_pieces;
CREATE POLICY "kit_pieces_staff_delete_v1" ON public.kit_pieces
  FOR DELETE TO authenticated
  USING (user_can_access_team(team_id));

DROP POLICY IF EXISTS "kit_pieces_staff_insert_v1" ON public.kit_pieces;
CREATE POLICY "kit_pieces_staff_insert_v1" ON public.kit_pieces
  FOR INSERT TO authenticated
  WITH CHECK ((user_can_access_team(team_id) AND (EXISTS ( SELECT 1
   FROM teams t
  WHERE ((t.id = kit_pieces.team_id) AND (t.club_id = kit_pieces.club_id))))));

DROP POLICY IF EXISTS "kit_pieces_staff_select_v1" ON public.kit_pieces;
CREATE POLICY "kit_pieces_staff_select_v1" ON public.kit_pieces
  FOR SELECT TO authenticated
  USING (user_can_access_team(team_id));

DROP POLICY IF EXISTS "kit_pieces_staff_update_v1" ON public.kit_pieces;
CREATE POLICY "kit_pieces_staff_update_v1" ON public.kit_pieces
  FOR UPDATE TO authenticated
  USING (user_can_access_team(team_id))
  WITH CHECK ((user_can_access_team(team_id) AND (EXISTS ( SELECT 1
   FROM teams t
  WHERE ((t.id = kit_pieces.team_id) AND (t.club_id = kit_pieces.club_id))))));

DROP POLICY IF EXISTS "lineup_corrections_log_select" ON public.lineup_corrections_log;
CREATE POLICY "lineup_corrections_log_select" ON public.lineup_corrections_log
  FOR SELECT TO authenticated
  USING (user_is_game_coordinator(game_id));

DROP POLICY IF EXISTS "notification_recipients_owner_select_v1" ON public.notification_recipients;
CREATE POLICY "notification_recipients_owner_select_v1" ON public.notification_recipients
  FOR SELECT TO authenticated
  USING (((user_id = (select auth.uid())) AND user_can_access_notification_context(notification_id)));

DROP POLICY IF EXISTS "notification_recipients_owner_update_v1" ON public.notification_recipients;
CREATE POLICY "notification_recipients_owner_update_v1" ON public.notification_recipients
  FOR UPDATE TO authenticated
  USING (((user_id = (select auth.uid())) AND user_can_access_notification_context(notification_id)))
  WITH CHECK (((user_id = (select auth.uid())) AND user_can_access_notification_context(notification_id)));

DROP POLICY IF EXISTS "notifications_actor_insert_v1" ON public.notifications;
CREATE POLICY "notifications_actor_insert_v1" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK ((((actor_id IS NULL) OR (actor_id = (select auth.uid()))) AND user_can_access_notification_scope_v2(age_group_id, team_id) AND ((user_id IS NULL) OR user_matches_notification_recipient_scope_v2(user_id, age_group_id, team_id))));

DROP POLICY IF EXISTS "notifications_owner_delete_v1" ON public.notifications;
CREATE POLICY "notifications_owner_delete_v1" ON public.notifications
  FOR DELETE TO authenticated
  USING (((user_id = (select auth.uid())) AND ((team_id IS NULL) OR user_can_access_team(team_id)) AND user_can_access_age_group(age_group_id)));

DROP POLICY IF EXISTS "notifications_owner_select_v1" ON public.notifications;
CREATE POLICY "notifications_owner_select_v1" ON public.notifications
  FOR SELECT TO authenticated
  USING (((user_id = (select auth.uid())) AND ((team_id IS NULL) OR user_can_access_team(team_id)) AND user_can_access_age_group(age_group_id)));

DROP POLICY IF EXISTS "notifications_owner_update_v1" ON public.notifications;
CREATE POLICY "notifications_owner_update_v1" ON public.notifications
  FOR UPDATE TO authenticated
  USING (((user_id = (select auth.uid())) AND ((team_id IS NULL) OR user_can_access_team(team_id)) AND user_can_access_age_group(age_group_id)))
  WITH CHECK ((user_id = (select auth.uid())));

DROP POLICY IF EXISTS "opponents_delete_v1" ON public.opponents;
CREATE POLICY "opponents_delete_v1" ON public.opponents
  FOR DELETE TO authenticated
  USING (user_can_access_age_group(age_group_id));

DROP POLICY IF EXISTS "opponents_insert_v1" ON public.opponents;
CREATE POLICY "opponents_insert_v1" ON public.opponents
  FOR INSERT TO authenticated
  WITH CHECK (user_can_access_age_group(age_group_id));

DROP POLICY IF EXISTS "opponents_select_v1" ON public.opponents;
CREATE POLICY "opponents_select_v1" ON public.opponents
  FOR SELECT TO authenticated
  USING (user_can_access_age_group(age_group_id));

DROP POLICY IF EXISTS "opponents_update_v1" ON public.opponents;
CREATE POLICY "opponents_update_v1" ON public.opponents
  FOR UPDATE TO authenticated
  USING (user_can_access_age_group(age_group_id))
  WITH CHECK (user_can_access_age_group(age_group_id));

DROP POLICY IF EXISTS "coordenadores_gerem_elegibilidade" ON public.player_age_group_eligibility;
CREATE POLICY "coordenadores_gerem_elegibilidade" ON public.player_age_group_eligibility
  FOR ALL TO authenticated
  USING ((club_id IN ( SELECT cm.club_id
   FROM club_memberships cm
  WHERE (cm.profile_id = (select auth.uid()))
UNION
 SELECT ag.club_id
   FROM age_groups ag
  WHERE (ag.coordinator_id = (select auth.uid())))))
  WITH CHECK ((club_id IN ( SELECT cm.club_id
   FROM club_memberships cm
  WHERE (cm.profile_id = (select auth.uid()))
UNION
 SELECT ag.club_id
   FROM age_groups ag
  WHERE (ag.coordinator_id = (select auth.uid())))));

DROP POLICY IF EXISTS "staff_clube_le_elegibilidade" ON public.player_age_group_eligibility;
CREATE POLICY "staff_clube_le_elegibilidade" ON public.player_age_group_eligibility
  FOR SELECT TO authenticated
  USING ((club_id IN ( SELECT ags.club_id
   FROM age_group_staff ags
  WHERE (ags.profile_id = (select auth.uid()))
UNION
 SELECT cm.club_id
   FROM club_memberships cm
  WHERE (cm.profile_id = (select auth.uid()))
UNION
 SELECT ag.club_id
   FROM age_groups ag
  WHERE (ag.coordinator_id = (select auth.uid())))));

DROP POLICY IF EXISTS "Player access" ON public.players;
CREATE POLICY "Player access" ON public.players
  FOR ALL TO authenticated
  USING ((age_group_id IN ( SELECT age_groups.id
   FROM age_groups
  WHERE (age_groups.coordinator_id = (select auth.uid())))));

DROP POLICY IF EXISTS "players_staff_insert_v1" ON public.players;
CREATE POLICY "players_staff_insert_v1" ON public.players
  FOR INSERT TO authenticated
  WITH CHECK (user_can_access_age_group(age_group_id));

DROP POLICY IF EXISTS "players_staff_select_v1" ON public.players;
CREATE POLICY "players_staff_select_v1" ON public.players
  FOR SELECT TO authenticated
  USING (user_can_access_age_group(age_group_id));

DROP POLICY IF EXISTS "players_staff_update_v1" ON public.players;
CREATE POLICY "players_staff_update_v1" ON public.players
  FOR UPDATE TO authenticated
  USING (user_can_access_age_group(age_group_id))
  WITH CHECK (user_can_access_age_group(age_group_id));

DROP POLICY IF EXISTS "push_subscriptions_owner_delete_v1" ON public.push_subscriptions;
CREATE POLICY "push_subscriptions_owner_delete_v1" ON public.push_subscriptions
  FOR DELETE TO authenticated
  USING ((user_id = (select auth.uid())));

DROP POLICY IF EXISTS "push_subscriptions_owner_insert_v1" ON public.push_subscriptions;
CREATE POLICY "push_subscriptions_owner_insert_v1" ON public.push_subscriptions
  FOR INSERT TO authenticated
  WITH CHECK ((user_id = (select auth.uid())));

DROP POLICY IF EXISTS "push_subscriptions_owner_select_v1" ON public.push_subscriptions;
CREATE POLICY "push_subscriptions_owner_select_v1" ON public.push_subscriptions
  FOR SELECT TO authenticated
  USING ((user_id = (select auth.uid())));

DROP POLICY IF EXISTS "push_subscriptions_owner_update_v1" ON public.push_subscriptions;
CREATE POLICY "push_subscriptions_owner_update_v1" ON public.push_subscriptions
  FOR UPDATE TO authenticated
  USING ((user_id = (select auth.uid())))
  WITH CHECK ((user_id = (select auth.uid())));

DROP POLICY IF EXISTS "Coordinator manages invites" ON public.staff_invites;
CREATE POLICY "Coordinator manages invites" ON public.staff_invites
  FOR ALL TO authenticated
  USING (((age_group_id IN ( SELECT age_groups.id
   FROM age_groups
  WHERE (age_groups.coordinator_id = (select auth.uid())))) OR (invited_by = (select auth.uid()))));

DROP POLICY IF EXISTS "anyone_can_read_invite_by_code" ON public.staff_invites;
CREATE POLICY "anyone_can_read_invite_by_code" ON public.staff_invites
  FOR SELECT TO authenticated
  USING (((select auth.uid()) IS NOT NULL));

DROP POLICY IF EXISTS "authenticated_can_update_invite" ON public.staff_invites;
CREATE POLICY "authenticated_can_update_invite" ON public.staff_invites
  FOR UPDATE TO authenticated
  USING (((select auth.uid()) IS NOT NULL));

DROP POLICY IF EXISTS "coordinator_can_delete_invite" ON public.staff_invites;
CREATE POLICY "coordinator_can_delete_invite" ON public.staff_invites
  FOR DELETE TO authenticated
  USING ((age_group_id IN ( SELECT age_groups.id
   FROM age_groups
  WHERE (age_groups.coordinator_id = (select auth.uid())))));

DROP POLICY IF EXISTS "coordinator_can_insert_invite" ON public.staff_invites;
CREATE POLICY "coordinator_can_insert_invite" ON public.staff_invites
  FOR INSERT TO authenticated
  WITH CHECK ((age_group_id IN ( SELECT age_groups.id
   FROM age_groups
  WHERE (age_groups.coordinator_id = (select auth.uid())))));

DROP POLICY IF EXISTS "coordinator_can_manage_invites" ON public.staff_invites;
CREATE POLICY "coordinator_can_manage_invites" ON public.staff_invites
  FOR SELECT TO authenticated
  USING ((age_group_id IN ( SELECT age_groups.id
   FROM age_groups
  WHERE (age_groups.coordinator_id = (select auth.uid())))));

DROP POLICY IF EXISTS "staff_invites_coordinator_delete_v1" ON public.staff_invites;
CREATE POLICY "staff_invites_coordinator_delete_v1" ON public.staff_invites
  FOR DELETE TO authenticated
  USING (user_can_manage_age_group_v2(age_group_id));

DROP POLICY IF EXISTS "staff_invites_coordinator_insert_v1" ON public.staff_invites;
CREATE POLICY "staff_invites_coordinator_insert_v1" ON public.staff_invites
  FOR INSERT TO authenticated
  WITH CHECK ((user_can_manage_age_group_v2(age_group_id) AND ((invited_by IS NULL) OR (invited_by = (select auth.uid()))) AND (EXISTS ( SELECT 1
   FROM age_groups ag
  WHERE ((ag.id = staff_invites.age_group_id) AND (ag.club_id = staff_invites.club_id))))));

DROP POLICY IF EXISTS "staff_invites_coordinator_update_v1" ON public.staff_invites;
CREATE POLICY "staff_invites_coordinator_update_v1" ON public.staff_invites
  FOR UPDATE TO authenticated
  USING (user_can_manage_age_group_v2(age_group_id))
  WITH CHECK ((user_can_manage_age_group_v2(age_group_id) AND (EXISTS ( SELECT 1
   FROM age_groups ag
  WHERE ((ag.id = staff_invites.age_group_id) AND (ag.club_id = staff_invites.club_id))))));

DROP POLICY IF EXISTS "staff_invites_domain_boundary_v2" ON public.staff_invites;
CREATE POLICY "staff_invites_domain_boundary_v2" ON public.staff_invites AS RESTRICTIVE
  FOR ALL TO authenticated
  USING ((user_can_access_age_group(age_group_id) OR ((email IS NOT NULL) AND (lower(email) = lower(COALESCE(((select auth.jwt()) ->> 'email'::text), ''::text))))))
  WITH CHECK ((user_can_manage_age_group_v2(age_group_id) AND (EXISTS ( SELECT 1
   FROM age_groups ag
  WHERE ((ag.id = staff_invites.age_group_id) AND (ag.club_id = staff_invites.club_id))))));

DROP POLICY IF EXISTS "staff_invites_select_v1" ON public.staff_invites;
CREATE POLICY "staff_invites_select_v1" ON public.staff_invites
  FOR SELECT TO authenticated
  USING ((user_can_access_age_group_v2(age_group_id) OR ((email IS NOT NULL) AND (lower(email) = lower(COALESCE(((select auth.jwt()) ->> 'email'::text), ''::text))))));

DROP POLICY IF EXISTS "authenticated_can_insert_staff" ON public.team_staff;
CREATE POLICY "authenticated_can_insert_staff" ON public.team_staff
  FOR INSERT TO authenticated
  WITH CHECK ((profile_id = (select auth.uid())));

DROP POLICY IF EXISTS "coordinator_can_delete_staff" ON public.team_staff;
CREATE POLICY "coordinator_can_delete_staff" ON public.team_staff
  FOR DELETE TO authenticated
  USING ((team_id IN ( SELECT age_groups.id
   FROM age_groups
  WHERE (age_groups.coordinator_id = (select auth.uid())))));

DROP POLICY IF EXISTS "coordinator_can_view_staff" ON public.team_staff;
CREATE POLICY "coordinator_can_view_staff" ON public.team_staff
  FOR SELECT TO authenticated
  USING ((team_id IN ( SELECT age_groups.id
   FROM age_groups
  WHERE (age_groups.coordinator_id = (select auth.uid())))));

DROP POLICY IF EXISTS "staff_can_view_own" ON public.team_staff;
CREATE POLICY "staff_can_view_own" ON public.team_staff
  FOR SELECT TO authenticated
  USING ((profile_id = (select auth.uid())));

DROP POLICY IF EXISTS "team_staff_coordinator_delete_v1" ON public.team_staff;
CREATE POLICY "team_staff_coordinator_delete_v1" ON public.team_staff
  FOR DELETE TO authenticated
  USING (user_is_team_coordinator(team_id));

DROP POLICY IF EXISTS "team_staff_coordinator_insert_v1" ON public.team_staff;
CREATE POLICY "team_staff_coordinator_insert_v1" ON public.team_staff
  FOR INSERT TO authenticated
  WITH CHECK ((user_is_team_coordinator(team_id) AND (EXISTS ( SELECT 1
   FROM teams t
  WHERE ((t.id = team_staff.team_id) AND (t.club_id = team_staff.club_id))))));

DROP POLICY IF EXISTS "team_staff_coordinator_update_v1" ON public.team_staff;
CREATE POLICY "team_staff_coordinator_update_v1" ON public.team_staff
  FOR UPDATE TO authenticated
  USING (user_is_team_coordinator(team_id))
  WITH CHECK ((user_is_team_coordinator(team_id) AND (EXISTS ( SELECT 1
   FROM teams t
  WHERE ((t.id = team_staff.team_id) AND (t.club_id = team_staff.club_id))))));

DROP POLICY IF EXISTS "team_staff_domain_boundary_v2" ON public.team_staff;
CREATE POLICY "team_staff_domain_boundary_v2" ON public.team_staff AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (((profile_id = (select auth.uid())) OR user_can_access_team(team_id)))
  WITH CHECK ((user_is_team_coordinator(team_id) AND (EXISTS ( SELECT 1
   FROM teams t
  WHERE ((t.id = team_staff.team_id) AND (t.club_id = team_staff.club_id))))));

DROP POLICY IF EXISTS "team_staff_member_select_v1" ON public.team_staff;
CREATE POLICY "team_staff_member_select_v1" ON public.team_staff
  FOR SELECT TO authenticated
  USING (((profile_id = (select auth.uid())) OR user_can_access_team(team_id)));

DROP POLICY IF EXISTS "Team access" ON public.teams;
CREATE POLICY "Team access" ON public.teams
  FOR ALL TO authenticated
  USING (((age_group_id IN ( SELECT age_groups.id
   FROM age_groups
  WHERE (age_groups.coordinator_id = (select auth.uid())))) OR (id IN ( SELECT team_staff.team_id
   FROM team_staff
  WHERE (team_staff.profile_id = (select auth.uid()))))));

DROP POLICY IF EXISTS "teams_club_delete_v1" ON public.teams;
CREATE POLICY "teams_club_delete_v1" ON public.teams
  FOR DELETE TO authenticated
  USING (user_can_manage_age_group_v2(age_group_id));

DROP POLICY IF EXISTS "teams_club_insert_v1" ON public.teams;
CREATE POLICY "teams_club_insert_v1" ON public.teams
  FOR INSERT TO authenticated
  WITH CHECK ((user_can_manage_age_group_v2(age_group_id) AND (EXISTS ( SELECT 1
   FROM age_groups ag
  WHERE ((ag.id = teams.age_group_id) AND (ag.club_id = teams.club_id))))));

DROP POLICY IF EXISTS "teams_club_select_v1" ON public.teams;
CREATE POLICY "teams_club_select_v1" ON public.teams
  FOR SELECT TO authenticated
  USING (user_can_access_team_v2(id));

DROP POLICY IF EXISTS "teams_club_update_v1" ON public.teams;
CREATE POLICY "teams_club_update_v1" ON public.teams
  FOR UPDATE TO authenticated
  USING (user_can_manage_age_group_v2(age_group_id))
  WITH CHECK ((user_can_manage_age_group_v2(age_group_id) AND (EXISTS ( SELECT 1
   FROM age_groups ag
  WHERE ((ag.id = teams.age_group_id) AND (ag.club_id = teams.club_id))))));

DROP POLICY IF EXISTS "Age group access training sessions" ON public.training_sessions;
CREATE POLICY "Age group access training sessions" ON public.training_sessions
  FOR ALL TO authenticated
  USING (((age_group_id IN ( SELECT age_groups.id
   FROM age_groups
  WHERE (age_groups.coordinator_id = (select auth.uid())))) OR (team_id IN ( SELECT t.id
   FROM (teams t
     JOIN age_groups ag ON ((ag.id = t.age_group_id)))
  WHERE (ag.coordinator_id = (select auth.uid()))))));

DROP POLICY IF EXISTS "Team access training_sessions" ON public.training_sessions;
CREATE POLICY "Team access training_sessions" ON public.training_sessions
  FOR ALL TO authenticated
  USING ((team_id IN ( SELECT t.id
   FROM (teams t
     JOIN age_groups ag ON ((ag.id = t.age_group_id)))
  WHERE (ag.coordinator_id = (select auth.uid())))))
  WITH CHECK ((team_id IN ( SELECT t.id
   FROM (teams t
     JOIN age_groups ag ON ((ag.id = t.age_group_id)))
  WHERE (ag.coordinator_id = (select auth.uid())))));

DROP POLICY IF EXISTS "Team access trainings" ON public.trainings;
CREATE POLICY "Team access trainings" ON public.trainings
  FOR ALL TO authenticated
  USING ((team_id IN ( SELECT t.id
   FROM (teams t
     JOIN age_groups ag ON ((ag.id = t.age_group_id)))
  WHERE (ag.coordinator_id = (select auth.uid())))));

DROP POLICY IF EXISTS "Only authenticated users can read waitlist" ON public.waitlist;
CREATE POLICY "Only authenticated users can read waitlist" ON public.waitlist
  FOR SELECT TO authenticated
  USING (((select auth.role()) = 'authenticated'::text));


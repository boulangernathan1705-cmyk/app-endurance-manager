-- La base DEV a reçu les migrations expérimentales 0018 à 0024 (communautés), retirées du code.
-- Leurs déclencheurs bloqueraient l'ajout de pilotes aux équipages : on les supprime.
-- Sans effet sur une base qui n'a jamais reçu ces migrations (PROD).
DROP TRIGGER IF EXISTS crew_member_audience;
DROP TRIGGER IF EXISTS registration_audience_in_use;
DROP TRIGGER IF EXISTS crew_member_same_organization;
DROP TRIGGER IF EXISTS crew_organization_fixed;
DROP TRIGGER IF EXISTS registration_organization_fixed;
DROP TRIGGER IF EXISTS registration_one_organization;
DROP TRIGGER IF EXISTS organization_member_one_team;
DROP TRIGGER IF EXISTS organization_member_one_team_update;

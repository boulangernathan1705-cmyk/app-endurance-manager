import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('la migration transforme les Teams existantes sans collision de nom',()=>{
  const db=new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE organizations(id TEXT PRIMARY KEY,type TEXT NOT NULL CHECK(type IN ('team','community')),name TEXT NOT NULL,name_key TEXT NOT NULL,visibility TEXT NOT NULL DEFAULT 'public',join_mode TEXT NOT NULL DEFAULT 'open',updated_at INTEGER NOT NULL DEFAULT 0,UNIQUE(type,name_key));
    CREATE TABLE organization_members(organization_id TEXT,user_id TEXT,role TEXT,created_at INTEGER);
    CREATE TRIGGER organization_member_one_team BEFORE INSERT ON organization_members WHEN 0 BEGIN SELECT 1; END;
    CREATE TRIGGER organization_member_one_team_update BEFORE UPDATE ON organization_members WHEN 0 BEGIN SELECT 1; END;
    INSERT INTO organizations VALUES('community','community','Paddock','paddock','public','open',0);
    INSERT INTO organizations VALUES('legacy','team','Paddock','paddock','public','open',0);
    INSERT INTO organization_members VALUES('legacy','pilot','owner',1);`);
  db.exec(read('migrations/0024_teams_to_private_communities.sql'));
  const legacy=db.prepare('SELECT * FROM organizations WHERE id=?').get('legacy');
  assert.equal(legacy.type,'community');
  assert.equal(legacy.visibility,'private');
  assert.equal(legacy.join_mode,'invite');
  assert.match(legacy.name,/privé/);
  assert.equal(db.prepare('SELECT organization_id FROM organization_members WHERE user_id=?').get('pilot').organization_id,'legacy');
  assert.equal(db.prepare("SELECT COUNT(*) total FROM sqlite_master WHERE type='trigger' AND name LIKE 'organization_member_one_team%'").get().total,0);
  db.close();
});

test('les communautés étendent le socle métier sans dupliquer les endurances',()=>{
  const organizations=read('migrations/0018_organizations.sql');
  const audiences=read('migrations/0019_registration_audiences.sql');
  const directory=read('migrations/0020_community_directory.sql');
  const eventScope=read('migrations/0021_event_communities.sql');
  const branding=read('migrations/0022_community_branding.sql');
  const discordSync=read('migrations/0023_community_discord_sync.sql');
  const privateCommunities=read('migrations/0024_teams_to_private_communities.sql');
  const api=read('server/organizations.mjs');
  assert.match(organizations,/CREATE TABLE organizations/);
  assert.match(audiences,/CREATE TABLE registration_audiences/);
  assert.match(directory,/organization_join_requests/);
  assert.match(eventScope,/ALTER TABLE events ADD COLUMN organization_id/);
  assert.match(branding,/preferred_community_id/);
  assert.match(branding,/logo_url/);
  assert.match(branding,/banner_url/);
  assert.match(discordSync,/discord_sync_enabled/);
  assert.match(discordSync,/discord_manager_role_id/);
  assert.match(discordSync,/discord_weekly_webhook_url/);
  assert.match(privateCommunities,/UPDATE organizations/);
  assert.match(privateCommunities,/type='community'/);
  assert.match(privateCommunities,/visibility='private'/);
  assert.match(privateCommunities,/join_mode='invite'/);
  assert.match(privateCommunities,/DROP TRIGGER IF EXISTS organization_member_one_team/);
  assert.match(api,/communityDirectoryApi/);
  assert.match(api,/requireOrganizationEligibility/);
});

test('une communauté fonctionne sans Discord et peut ajouter Discord comme règle facultative',()=>{
  const directory=read('server/community-directory.mjs');
  const discord=read('server/community-discord.mjs');
  assert.match(directory,/JOIN_MODES=new Set\(\['open','request','invite','discord'\]\)/);
  assert.match(directory,/requireOrganizationEligibility/);
  assert.match(discord,/DISCORD_BOT_TOKEN/);
  assert.match(discord,/guilds\/.*members/);
  assert.doesNotMatch(discord,/guilds\/.*members\?limit/);
  assert.match(discord,/iconUrl:discordAsset/);
  assert.match(discord,/bannerUrl:discordAsset/);
  assert.match(discord,/discordCommunityStatus/);
  assert.match(directory,/syncDiscordCommunityUser/);
  assert.match(directory,/managerRoleId/);
  assert.match(directory,/discord_sync_enabled/);
});

test('la communauté active est choisie avant le simulateur et l’annuaire devient secondaire',()=>{
  const hub=read('front/game-hub.mjs');
  const index=read('index.html');
  const home=read('front/app/home-view.mjs');
  const directory=read('front/app/community-directory.mjs');
  const context=read('front/app/organization-context.mjs');
  assert.match(home,/nav-community-context/);
  assert.match(home,/communityContextMarkup/);
  assert.match(home,/contextEvents/);
  assert.doesNotMatch(home,/button\('communities','Communautés'\)/);
  assert.match(directory,/Ton espace actif se choisit depuis la barre principale/);
  assert.match(directory,/Découvrir d’autres communautés/);
  assert.doesNotMatch(directory,/Trouve ton paddock/);
  assert.match(context,/preferredCommunityId/);
  assert.match(context,/communityById/);
  assert.match(index,/id="community-stage"/);
  assert.match(index,/id="simulator-stage"[^>]+hidden/);
  assert.doesNotMatch(index,/1 · ESPACE|2 · SIMULATEUR/);
  assert.match(hub,/showSimulatorStage/);
  assert.match(hub,/communityId \|\| 'general'/);
  assert.match(hub,/joined\.length===1/);
  assert.match(directory,/location\.origin\+'\/\?community='/);
});

test('les gérants peuvent personnaliser leur espace sans créer un moteur de thème parallèle',()=>{
  const directory=read('front/app/community-directory.mjs');
  const directoryCss=read('styles/community-directory.css');
  const css=read('styles/community-context.css');
  const server=read('server/community-directory.mjs');
  const account=read('front/account-menu.mjs');
  const registration=read('front/app/registration.mjs');
  assert.match(directory,/Visuels Discord utilisés automatiquement/);
  assert.match(directory,/logoUrl/);
  assert.match(directory,/bannerUrl/);
  assert.match(directory,/accentColor/);
  assert.match(server,/imageUrl\(input\.logoUrl/);
  assert.match(server,/accentColor\(input\.accentColor/);
  assert.match(css,/community-home-banner/);
  assert.match(account,/account-community-badge/);
  assert.match(registration,/pilot-community-logo/);
  assert.match(directory,/Qui peut administrer le site/);
  assert.match(directory,/Synchroniser automatiquement les membres et organisateurs/);
  assert.match(directory,/Webhook du salon récapitulatif/);
  assert.match(directory,/community-setup-steps/);
  assert.match(directory,/Mode développeur/);
  assert.match(directory,/Ouvre uniquement la partie que tu souhaites modifier/);
  assert.match(directoryCss,/input:not\(\[type="checkbox"\]\)/);
  assert.match(directoryCss,/\.community-choice-group input/);
});

test('les communautés remplacent les anciennes Teams et chargent leurs membres quel que soit le point d’entrée',()=>{
  const server=read('server/community-directory.mjs');
  const front=read('front/app/community-directory.mjs');
  const context=read('front/app/organization-context.mjs');
  assert.match(server,/memberCountsFor/);
  assert.match(server,/LIMIT \? OFFSET \?/);
  assert.match(server,/Math\.min\(100/);
  assert.doesNotMatch(server,/input\.type==='team'|one_team_only/);
  assert.doesNotMatch(front,/teamPanel|data-community-form="team"|Team privée/);
  assert.doesNotMatch(context,/organizations\.team|type==='team'/);
  assert.match(front,/loadCommunityMembers/);
  assert.match(front,/ensureCommunityMembers/);
  assert.match(front,/memberLoading:new Set\(\)/);
  assert.match(front,/memberErrors:new Map\(\)/);
  assert.match(front,/queueMicrotask\(\(\)=>void ensureCommunityMembers/);
  assert.match(front,/limit=50&offset=/);
  assert.match(front,/more-members/);
  assert.match(front,/refresh-members/);
  assert.doesNotMatch(front,/function eventList|ENDURANCES ·|Créer une endurance/);
});

test('les endurances et inscriptions restent enfermées dans leur communauté active',()=>{
  const context=read('front/app/core.mjs');
  const home=read('front/app/home-view.mjs');
  const entries=read('front/app/entries-view.mjs');
  const registration=read('front/app/registration.mjs');
  assert.match(context,/activeCommunityId/);
  assert.match(home,/event\.organizationId===communityId/);
  assert.match(entries,/event\.organizationId===state\.activeCommunityId/);
  assert.match(registration,/event\.organizationId\?\[event\.organizationId\]/);
});

test('les assets de la nouvelle interface sont versionnés et les fixtures dev restent isolées',()=>{
  const seed=read('server/dev-seed-organizations.mjs');
  const html=read('game.html');
  const app=read('app.js');
  assert.match(seed,/https:\/\/app\.endurance-manager\.workers\.dev/);
  assert.match(seed,/if\(url\.origin!==DEV_ORIGIN\)return/);
  assert.match(html,/community-context\.css\?v=3-language-preserved/);
  assert.match(html,/community-directory\.css\?v=6-community-management-cleanup/);
  assert.match(html,/app\.js\?v=98-community-management-cleanup/);
  assert.match(app,/paddock-network\.mjs\?v=9-community-only/);
});

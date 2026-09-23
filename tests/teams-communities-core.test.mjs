import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('les communautés étendent le socle métier sans dupliquer les endurances',()=>{
  const organizations=read('migrations/0018_organizations.sql');
  const audiences=read('migrations/0019_registration_audiences.sql');
  const directory=read('migrations/0020_community_directory.sql');
  const eventScope=read('migrations/0021_event_communities.sql');
  const branding=read('migrations/0022_community_branding.sql');
  const api=read('server/organizations.mjs');
  assert.match(organizations,/CREATE TABLE organizations/);
  assert.match(audiences,/CREATE TABLE registration_audiences/);
  assert.match(directory,/organization_join_requests/);
  assert.match(eventScope,/ALTER TABLE events ADD COLUMN organization_id/);
  assert.match(branding,/preferred_community_id/);
  assert.match(branding,/logo_url/);
  assert.match(branding,/banner_url/);
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
});

test('la communauté active est choisie avant le simulateur et l’annuaire devient secondaire',()=>{
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
});

test('les gérants peuvent personnaliser leur espace sans créer un moteur de thème parallèle',()=>{
  const directory=read('front/app/community-directory.mjs');
  const css=read('styles/community-context.css');
  const server=read('server/community-directory.mjs');
  const account=read('front/account-menu.mjs');
  const registration=read('front/app/registration.mjs');
  assert.match(directory,/IDENTITÉ VISUELLE/);
  assert.match(directory,/logoUrl/);
  assert.match(directory,/bannerUrl/);
  assert.match(directory,/accentColor/);
  assert.match(server,/imageUrl\(input\.logoUrl/);
  assert.match(server,/accentColor\(input\.accentColor/);
  assert.match(css,/community-home-banner/);
  assert.match(account,/account-community-badge/);
  assert.match(registration,/pilot-community-logo/);
});

test('les grandes communautés ne chargent leurs membres qu’à l’ouverture',()=>{
  const server=read('server/community-directory.mjs');
  const front=read('front/app/community-directory.mjs');
  assert.match(server,/memberCountsFor/);
  assert.match(server,/membersFor\(env,team\?\[team\.id\]:\[\]\)/);
  assert.match(server,/LIMIT \? OFFSET \?/);
  assert.match(server,/Math\.min\(100/);
  assert.match(front,/loadCommunityMembers/);
  assert.match(front,/limit=50&offset=/);
  assert.match(front,/more-members/);
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
  assert.match(html,/community-context\.css\?v=2-branding/);
  assert.match(html,/community-directory\.css\?v=2-secondary/);
  assert.match(html,/app\.js\?v=89-community-branding/);
  assert.match(app,/paddock-network\.mjs\?v=3-community-context/);
});

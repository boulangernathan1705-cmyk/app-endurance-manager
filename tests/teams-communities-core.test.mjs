import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('les communautés étendent le socle métier sans dupliquer les endurances',()=>{
  const organizations=read('migrations/0018_organizations.sql');
  const audiences=read('migrations/0019_registration_audiences.sql');
  const directory=read('migrations/0020_community_directory.sql');
  const api=read('server/organizations.mjs');
  assert.match(organizations,/CREATE TABLE organizations/);
  assert.match(audiences,/CREATE TABLE registration_audiences/);
  assert.match(directory,/organization_join_requests/);
  assert.match(directory,/discord_guild_id/);
  assert.match(directory,/discord_role_id/);
  assert.match(api,/communityDirectoryApi/);
  assert.match(api,/decorateEvents/);
  assert.match(api,/requireOrganizationEligibility/);
});

test('une communauté fonctionne sans Discord et peut ajouter Discord comme règle facultative',()=>{
  const directory=read('server/community-directory.mjs');
  const discord=read('server/community-discord.mjs');
  assert.match(directory,/Discord.*facultatif|discordBotReady/i);
  assert.match(directory,/JOIN_MODES=new Set\(\['open','request','invite','discord'\]\)/);
  assert.match(directory,/requireOrganizationEligibility/);
  assert.match(discord,/DISCORD_BOT_TOKEN/);
  assert.match(discord,/guilds\/.*members/);
  assert.doesNotMatch(discord,/guilds\/.*members\?limit/);
  assert.match(discord,/Gérer le serveur/);
});

test('le front possède un annuaire et une fiche communauté plutôt qu’un tiroir parallèle',()=>{
  const directory=read('front/app/community-directory.mjs');
  const network=read('front/app/paddock-network.mjs');
  const home=read('front/app/home-view.mjs');
  assert.match(directory,/Trouve ton paddock/);
  assert.match(directory,/Communautés disponibles/);
  assert.match(directory,/Discord est facultatif/);
  assert.match(directory,/Administration de la communauté/);
  assert.match(directory,/Rôle requis pour participer aux endurances/);
  assert.match(home,/button\('communities','Communautés'\)/);
  assert.match(home,/ACTIVITÉ DU PADDOCK/);
  assert.doesNotMatch(network,/network-drawer/);
  assert.doesNotMatch(network,/Mon réseau/);
  assert.match(network,/scopeNetworkTo/);
});

test('les communautés restent facultatives autour des événements existants',()=>{
  const context=read('front/app/organization-context.mjs');
  const actions=read('front/app/actions.mjs');
  assert.match(context,/GENERAL_AUDIENCE='general'/);
  assert.match(context,/defaultRegistrationAudienceIds/);
  assert.match(actions,/case 'communities'/);
  assert.match(actions,/renderCommunities/);
  assert.match(actions,/case 'home'/);
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
  assert.match(front,/Afficher plus/);
});

test('les assets de la nouvelle interface sont versionnés et les fixtures dev restent isolées',()=>{
  const seed=read('server/dev-seed-organizations.mjs');
  const html=read('game.html');
  const app=read('app.js');
  assert.match(seed,/https:\/\/app\.endurance-manager\.workers\.dev/);
  assert.match(seed,/if\(url\.origin!==DEV_ORIGIN\)return/);
  assert.match(html,/community-directory\.css\?v=1/);
  assert.match(html,/app\.js\?v=87-community-directory/);
  assert.match(app,/paddock-network\.mjs\?v=2-community-directory/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('l’accueil va directement au choix LMU ou iRacing',()=>{
  const html=read('index.html');
  const hub=read('front/game-hub.mjs');
  assert.match(html,/Choisis ton simulateur/);
  assert.match(html,/Le Mans Ultimate/);
  assert.match(html,/iRacing/);
  assert.doesNotMatch(html,/Choisis ta communauté|community-stage|Changer de communauté/);
  assert.match(hub,/siteCommunityId/);
});

test('la consultation est publique mais une nouvelle inscription exige Discord',()=>{
  const eventView=read('front/app/event-view.mjs');
  const server=read('server/organizations.mjs');
  assert.match(eventView,/Se connecter pour s’inscrire/);
  assert.match(eventView,/\/api\/auth\/discord\?return=/);
  assert.match(server,/Connecte-toi avec Discord pour t’inscrire/);
  assert.match(server,/allowed\.add\(site\.id\)/);
  assert.match(server,/data\.events=data\.events\.filter\(event=>!event\.organizationId\|\|\(site&&event\.organizationId===site\.id\)\)/);
});

test('les paramètres sont ceux du site et non un annuaire de communautés',()=>{
  const settings=read('front/community-settings-page.mjs');
  const directory=read('front/app/community-directory.mjs');
  const account=read('front/account-menu.mjs');
  assert.match(settings,/siteCommunityId/);
  assert.match(directory,/SITE DES TONDEUZ/);
  assert.match(directory,/Paramètres du site/);
  assert.match(account,/Paramètres du site/);
  assert.doesNotMatch(directory,/function detail\(community\)[\s\S]*Copier le lien de la page/);
});

test('la création de course et d’équipage ne demande plus de choisir un espace',()=>{
  const eventForm=read('front/app/event-form.mjs');
  const crewBuilder=read('crew-builder.js');
  assert.doesNotMatch(eventForm,/Endurance indépendante · Général|<select name="eventOrganization"/);
  assert.match(eventForm,/type="hidden" name="eventOrganization"/);
  assert.doesNotMatch(crewBuilder,/Choisis l’espace auquel appartient l’équipage|Créer pour<select/);
  assert.match(crewBuilder,/type="hidden" name="builderOrganization"/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {scopeDeparture,scopeEvent,audienceChoices,normalizeAudienceFilter} from '../front/app/organization-context.mjs';

const migration18=readFileSync(new URL('../migrations/0018_organizations.sql',import.meta.url),'utf8');
const migration19=readFileSync(new URL('../migrations/0019_registration_audiences.sql',import.meta.url),'utf8');

function baseDatabase(){
  const db=new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  db.exec(`
    CREATE TABLE users(id TEXT PRIMARY KEY,name TEXT NOT NULL);
    CREATE TABLE registrations(id TEXT PRIMARY KEY,event_id TEXT NOT NULL,departure_id TEXT NOT NULL,participant_id TEXT NOT NULL,created_at INTEGER NOT NULL);
    CREATE TABLE crews(id TEXT PRIMARY KEY,event_id TEXT NOT NULL,departure_id TEXT NOT NULL);
    CREATE TABLE crew_members(registration_id TEXT PRIMARY KEY,crew_id TEXT NOT NULL);
  `);
  db.exec(migration18);
  return db;
}

function database(){
  const db=baseDatabase();
  db.exec(migration19);
  return db;
}

test('un pilote ne peut appartenir qu’à une seule Team mais peut rejoindre plusieurs communautés',()=>{
  const db=database();
  db.exec("INSERT INTO users VALUES('u1','Nathan'); INSERT INTO users VALUES('u2','Pilote');");
  db.exec("INSERT INTO organizations VALUES('team-a','team','FMT','fmt','u1',1); INSERT INTO organizations VALUES('team-b','team','Autre','autre','u2',1); INSERT INTO organizations VALUES('community-a','community','LMU France','lmu france','u1',1); INSERT INTO organizations VALUES('community-b','community','Endurance FR','endurance fr','u2',1);");
  db.exec("INSERT INTO organization_members VALUES('team-a','u1','owner',1)");
  assert.throws(()=>db.exec("INSERT INTO organization_members VALUES('team-b','u1','member',1)"),/one_team_only/);
  db.exec("INSERT INTO organization_members VALUES('community-a','u1','owner',1); INSERT INTO organization_members VALUES('community-b','u1','member',1);");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM organization_members WHERE user_id='u1'").get().n,3);
});

test('0019 convertit l’ancien contexte unique en audience sans dupliquer l’inscription',()=>{
  const db=baseDatabase();
  db.exec("INSERT INTO users VALUES('u1','Nathan'); INSERT INTO organizations VALUES('team-a','team','FMT','fmt','u1',1);");
  db.exec("INSERT INTO registrations(id,event_id,departure_id,participant_id,created_at,organization_id) VALUES('r1','event','departure','pilot',123,'team-a')");
  db.exec(migration19);
  const registration=db.prepare("SELECT organization_id FROM registrations WHERE id='r1'").get();
  const audiences=db.prepare("SELECT audience_key,organization_id FROM registration_audiences WHERE registration_id='r1'").all();
  assert.equal(registration.organization_id,null);
  assert.deepEqual(audiences,[{audience_key:'team-a',organization_id:'team-a'}]);
});

test('une seule inscription peut être partagée avec Général, la Team et plusieurs communautés',()=>{
  const db=database();
  db.exec("INSERT INTO users VALUES('u1','Nathan'); INSERT INTO organizations VALUES('team-a','team','FMT','fmt','u1',1); INSERT INTO organizations VALUES('community-a','community','LMU France','lmu france','u1',1);");
  db.exec("INSERT INTO registrations(id,event_id,departure_id,participant_id,created_at) VALUES('r1','event','departure','pilot',1)");
  db.exec("INSERT INTO registration_audiences VALUES('r1','general',NULL,1); INSERT INTO registration_audiences VALUES('r1','team-a','team-a',1); INSERT INTO registration_audiences VALUES('r1','community-a','community-a',1);");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM registrations").get().n,1);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM registration_audiences WHERE registration_id='r1'").get().n,3);
});

test('un équipage garde un seul espace et refuse un pilote non partagé avec cet espace',()=>{
  const db=database();
  db.exec("INSERT INTO users VALUES('u1','Nathan'); INSERT INTO organizations VALUES('team-a','team','FMT','fmt','u1',1); INSERT INTO organizations VALUES('community-a','community','LMU France','lmu france','u1',1);");
  db.exec("INSERT INTO registrations(id,event_id,departure_id,participant_id,created_at) VALUES('r1','event','departure','pilot',1); INSERT INTO registration_audiences VALUES('r1','team-a','team-a',1);");
  db.exec("INSERT INTO crews(id,event_id,departure_id,organization_id) VALUES('c1','event','departure','team-a'); INSERT INTO crews(id,event_id,departure_id,organization_id) VALUES('c2','event','departure','community-a');");
  db.exec("INSERT INTO crew_members VALUES('r1','c1')");
  db.exec("DELETE FROM crew_members WHERE registration_id='r1'");
  assert.throws(()=>db.exec("INSERT INTO crew_members VALUES('r1','c2')"),/crew_membership_audience/);
});

test('une audience utilisée par un équipage ne peut pas être retirée de l’inscription',()=>{
  const db=database();
  db.exec("INSERT INTO users VALUES('u1','Nathan'); INSERT INTO organizations VALUES('team-a','team','FMT','fmt','u1',1);");
  db.exec("INSERT INTO registrations(id,event_id,departure_id,participant_id,created_at) VALUES('r1','event','departure','pilot',1); INSERT INTO registration_audiences VALUES('r1','team-a','team-a',1); INSERT INTO crews(id,event_id,departure_id,organization_id) VALUES('c1','event','departure','team-a'); INSERT INTO crew_members VALUES('r1','c1');");
  assert.throws(()=>db.exec("DELETE FROM registration_audiences WHERE registration_id='r1' AND audience_key='team-a'"),/audience_in_use/);
});

test('le filtre front fusionne plusieurs espaces sans dupliquer une inscription partagée',()=>{
  const shared={id:'shared',audienceIds:['general','team-a']};
  const departure={id:'d',availability:[shared,{id:'community',audienceIds:['community-a']}],crews:[{id:'cg',organizationId:null},{id:'ct',organizationId:'team-a'},{id:'cc',organizationId:'community-a'}]};
  const scoped=scopeDeparture(departure,new Set(['general','team-a']));
  assert.deepEqual(scoped.availability.map(item=>item.id),['shared']);
  assert.deepEqual(scoped.crews.map(item=>item.id),['cg','ct']);
  const event={id:'event',name:'8H Bahrain',departures:[departure]};
  const scopedEvent=scopeEvent(event,new Set(['team-a','community-a']));
  assert.equal(scopedEvent.id,event.id);
  assert.deepEqual(scopedEvent.departures[0].availability.map(item=>item.id),['shared','community']);
});

test('les filtres proposent Général, une Team et toutes les communautés rejointes',()=>{
  const organizations={team:{id:'t',name:'FMT'},communities:[{id:'c1',name:'LMU France'},{id:'c2',name:'Endurance FR'}]};
  assert.deepEqual(audienceChoices(organizations).map(item=>item.key),['general','t','c1','c2']);
  assert.deepEqual([...normalizeAudienceFilter(organizations,['general','c2','inconnu'])],['general','c2']);
  assert.deepEqual([...normalizeAudienceFilter(organizations,[])],['general','t','c1','c2']);
});

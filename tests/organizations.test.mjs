import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {scopeDeparture,scopeEvent,organizationChoices} from '../front/app/organization-context.mjs';

const migration=readFileSync(new URL('../migrations/0018_organizations.sql',import.meta.url),'utf8');

function database(){
  const db=new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  db.exec(`
    CREATE TABLE users(id TEXT PRIMARY KEY,name TEXT NOT NULL);
    CREATE TABLE registrations(id TEXT PRIMARY KEY,event_id TEXT NOT NULL,departure_id TEXT NOT NULL,participant_id TEXT NOT NULL);
    CREATE TABLE crews(id TEXT PRIMARY KEY,event_id TEXT NOT NULL,departure_id TEXT NOT NULL);
    CREATE TABLE crew_members(registration_id TEXT PRIMARY KEY,crew_id TEXT NOT NULL);
  `);
  db.exec(migration);
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

test('un même pilote ne peut pas être engagé dans deux organisations sur le même départ',()=>{
  const db=database();
  db.exec("INSERT INTO users VALUES('u1','Nathan'); INSERT INTO organizations VALUES('team-a','team','FMT','fmt','u1',1); INSERT INTO organizations VALUES('community-a','community','LMU France','lmu france','u1',1);");
  db.exec("INSERT INTO registrations(id,event_id,departure_id,participant_id,organization_id) VALUES('r1','event','departure','pilot','team-a')");
  assert.throws(()=>db.exec("INSERT INTO registrations(id,event_id,departure_id,participant_id,organization_id) VALUES('r2','event','departure','pilot','community-a')"),/participant_other_organization/);
  db.exec("INSERT INTO registrations(id,event_id,departure_id,participant_id,organization_id) VALUES('r3','event','other-departure','pilot','community-a')");
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM registrations').get().n,2);
});

test('un équipage ne peut recevoir que les inscriptions de sa propre organisation',()=>{
  const db=database();
  db.exec("INSERT INTO users VALUES('u1','Nathan'); INSERT INTO organizations VALUES('team-a','team','FMT','fmt','u1',1); INSERT INTO organizations VALUES('community-a','community','LMU France','lmu france','u1',1);");
  db.exec("INSERT INTO registrations(id,event_id,departure_id,participant_id,organization_id) VALUES('r1','event','departure','pilot','team-a'); INSERT INTO crews(id,event_id,departure_id,organization_id) VALUES('c1','event','departure','team-a'); INSERT INTO crews(id,event_id,departure_id,organization_id) VALUES('c2','event','departure','community-a');");
  db.exec("INSERT INTO crew_members VALUES('r1','c1')");
  db.exec("DELETE FROM crew_members WHERE registration_id='r1'");
  assert.throws(()=>db.exec("INSERT INTO crew_members VALUES('r1','c2')"),/organization_mismatch/);
});

test('le contexte front filtre pilotes et équipages sans dupliquer l’événement officiel',()=>{
  const departure={id:'d',availability:[{id:'general',organizationId:null},{id:'team',organizationId:'team-a'},{id:'community',organizationId:'community-a'}],crews:[{id:'cg',organizationId:null},{id:'ct',organizationId:'team-a'}]};
  assert.deepEqual(scopeDeparture(departure,'team-a').availability.map(item=>item.id),['team']);
  assert.deepEqual(scopeDeparture(departure,null).crews.map(item=>item.id),['cg']);
  const event={id:'event',name:'8H Bahrain',departures:[departure]};
  const scoped=scopeEvent(event,'community-a');
  assert.equal(scoped.id,event.id);
  assert.equal(scoped.name,event.name);
  assert.deepEqual(scoped.departures[0].availability.map(item=>item.id),['community']);
});

test('le sélecteur propose le général, une seule Team et toutes les communautés rejointes',()=>{
  const choices=organizationChoices({team:{id:'t',name:'FMT'},communities:[{id:'c1',name:'LMU France'},{id:'c2',name:'Endurance FR'}]});
  assert.deepEqual(choices.map(item=>item.id),['','t','c1','c2']);
});

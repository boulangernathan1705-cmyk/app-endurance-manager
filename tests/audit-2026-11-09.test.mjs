import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NOTIFICATION_KINDS} from '../server/notifications.mjs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

// Audit of 2026-11-09 (Nathan OK'd its 14 points).
test('the Discord setting says what the bot does: a poster, « S’inscrire », @everyone on stream days only', () => {
  const page = read('front/members-page.mjs');
  assert.doesNotMatch(page, /avec @everyone : les events/);
  assert.doesNotMatch(page, /Présent et Absent/);
  assert.doesNotMatch(page, /La soirée avec/);
  assert.match(page, /@everyone seulement les jours de stream/);
  assert.match(page, /En direct avec…/);
});

test('a step of the entry that misses something says it under its title, not in a window', () => {
  const actions = read('front/app/actions.mjs');
  assert.match(actions, /registration-step-error/);
  assert.match(read('styles/registration-context.css'), /\.registration-step-error\{/);
  // Step 1 with only a category to choose has no « Continuer ».
  assert.match(read('front/app/registration.mjs'), /const next=choiceOnly\?'':/);
});

test('« Mes inscriptions » has one title; its two groups are named only when the pilot manages other entries', () => {
  const entries = read('front/app/entries-view.mjs');
  assert.doesNotMatch(entries, /ESPACE PILOTE/);
  assert.match(entries, /\$\{managed\?`<div class="native-my-entries-group-heading">/);
});

test('the administrators are told in the bell when the bot loses a right, once', () => {
  assert.ok(NOTIFICATION_KINDS.includes('discord_error'));
  const recap = read('server/recap-discord.mjs');
  assert.match(recap, /!before\?\.last_error && \[401,403,404\]\.includes\(error\.status\)/);
  assert.match(read('front/notifications.mjs'), /case 'discord_error'/);
  assert.match(read('front/notifications.mjs'), /'\/members#discord'/);
});

test('« Nouveautés » shows the latest versions, the older ones behind a button', () => {
  const changelog = read('front/changelog.mjs');
  assert.match(changelog, /const LATEST = 5/);
  assert.match(read('privacy.css'), /\.changelog-page:not\(\.all-versions\) \.changelog-version\.is-older \{ display: none; \}/);
});

test('a stream keeps its logo beside its name and time in a day of the month', () => {
  const css = read('styles/season-calendar.css');
  assert.doesNotMatch(css, /,\.cal-main \.cal-day \.cal-logo-text\{/);
});

test('race page: thin hour bars and « Couverture », the organisers manage crews on the « Équipages » page',async()=>{
  const crews=read('front/app/crews.mjs');
  assert.match(crews,/hoursAxis\(event,departure\)/);
  assert.match(crews,/hoursCoverage\(event,departure,regs\)/);
  assert.match(crews,/crew\.canManage&&!can\('crews'\)/);
  assert.doesNotMatch(crews,/renderAvailabilityTimeline/);
  const view=read('front/app/event-view.mjs');
  assert.match(view,/label:'Gérer les équipages'/);
  const page=read('front/app/crews-page.mjs');
  assert.match(page,/data-action="crews-delete"/);
});

test('a 24 h race groups its hours by Paris day',async()=>{
  const {raceDayGroups,renderAvailabilityTimeline}=await import('../front/timeline.mjs');
  const departure={id:'d',startsAt:Date.UTC(2026,11,12,15,0),time:'16:00'};
  const groups=raceDayGroups(departure,24);
  assert.deepEqual(groups.map(group=>group.hours.length),[8,16]);
  assert.match(groups[0].name,/samedi 12/);assert.match(groups[1].short,/dim/);
  const html=renderAvailabilityTimeline({departure,duration:24,status:'h1,h9',interactive:true});
  assert.equal((html.match(/class="presence-day"/g)||[]).length,2);
  assert.equal((html.match(/aria-pressed="true"/g)||[]).length,2);
  assert.equal(raceDayGroups({...departure,tbd:true},24).length,1);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {translateTextForLocale,localeTag} from '../front/i18n.mjs';
import {translateExtendedTextForLocale} from '../front/i18n-content.mjs';

const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('les libellés principaux existent en anglais',()=>{
  assert.equal(translateTextForLocale('Événements','en'),'Events');
  assert.equal(translateTextForLocale('Départs passés','en'),'Past starts');
  assert.equal(translateTextForLocale('3 pilotes inscrits','en'),'3 registered drivers');
  assert.equal(translateTextForLocale('Équipage complet','en'),'Crew complete');
  assert.equal(translateTextForLocale('Événements','fr'),'Événements');
});

test('les compteurs dynamiques et libellés de course sont traduits sans reste français',()=>{
  assert.equal(translateTextForLocale('1 inscrit','en'),'1 driver');
  assert.equal(translateTextForLocale('2 inscrits','en'),'2 drivers');
  assert.equal(translateTextForLocale('2 équipages engagés','en'),'2 crews entered');
  assert.equal(translateTextForLocale('Championnat iRacing','en'),'iRacing Championship');
  assert.equal(translateTextForLocale('12h','en'),'12:00');
  assert.equal(translateTextForLocale('12h30','en'),'12:30');
});

test('la version française normalise les libellés incohérents ou fautifs',()=>{
  assert.equal(translateTextForLocale('Special event','fr'),'Événement spécial');
  assert.equal(translateTextForLocale('Ajouter un évènement','fr'),'Ajouter un événement');
  assert.equal(translateTextForLocale('Pilote souhaité','fr'),'Coéquipier souhaité');
  assert.equal(translateTextForLocale('Pseudo du pilote souhaité','fr'),'Pseudo du coéquipier souhaité');
  assert.equal(translateTextForLocale('Les dates et heures sont saisies en heure de Paris.','fr'),'Les dates et heures sont saisies à l’heure de Paris.');
});

test('les dialogues dynamiques sont traduisibles en anglais',()=>{
  assert.equal(translateTextForLocale('Marquer « ALPHA01 » comme équipage complet et verrouiller sa composition ?','en'),'Mark “ALPHA01” as complete and lock its lineup?');
  assert.equal(translateTextForLocale('Supprimer « ALPHA01 » et toutes ses inscriptions ? Cette suppression est définitive.','en'),'Delete “ALPHA01” and all its entries? This action is permanent.');
});

test('les écrans avancés et contenus longs ont une couverture anglaise cohérente',()=>{
  assert.equal(translateExtendedTextForLocale('FORMATION D’ÉQUIPAGE','en'),'CREW SETUP');
  assert.equal(translateExtendedTextForLocale('Aucun pilote sélectionné.','en'),'No driver selected.');
  assert.equal(translateExtendedTextForLocale('2 h de course ne sont pas encore couvertes.','en'),'2 race hours are still not covered.');
  assert.equal(translateExtendedTextForLocale('1 h de course n’est pas encore couverte.','en'),'1 race hour is still not covered.');
  assert.equal(translateExtendedTextForLocale('Équipage « ALPHA01 » créé. 2 autre(s) inscription(s) du même départ ont été retirées.','en'),'Crew “ALPHA01” created. 2 other entries were removed from the same start.');
  assert.equal(translateExtendedTextForLocale('Consulter les événements','en'),'Browse events');
  assert.equal(translateExtendedTextForLocale('Politique de confidentialité','en'),'Privacy policy');
  assert.equal(translateExtendedTextForLocale('Crédits des cartes de circuits','en'),'Circuit map credits');
  assert.equal(translateExtendedTextForLocale('2. Données traitées','en'),'2. Data processed');
});

test('la locale anglaise utilise un format britannique cohérent avec les heures 24 h',()=>{
  assert.equal(localeTag('en'),'en-GB');
  assert.equal(localeTag('fr'),'fr-FR');
});

test('le build injecte les deux couches de traduction sur les pages publiques et applicatives',()=>{
  const build=read('scripts/build.mjs');
  assert.match(build,/front\/i18n\.mjs/);
  assert.match(build,/front\/i18n-content\.mjs/);
  assert.match(build,/privacy\.html/);
  assert.match(build,/circuit-credits\.html/);
});

test('les dates applicatives utilisent la locale sélectionnée',()=>{
  assert.match(read('front/schedule.mjs'),/localeTag\(\)/);
  // Dates are formatted in one module, with the selected locale, and used by every page.
  assert.match(read('front/dates.mjs'),/Intl\.DateTimeFormat\(localeTag\(\)/);
  for(const file of ['front/game-hub.mjs','front/app/home-view.mjs','front/app/entries-view.mjs','front/app/event-view.mjs','crew-builder.js'])assert.match(read(file),/dates\.mjs/);
});

test('le sélecteur traduit aussi les confirmations natives en anglais',()=>{
  const i18n=read('front/i18n.mjs');
  assert.match(i18n,/installNativeDialogTranslation/);
  assert.match(i18n,/globalThis\.confirm=message=>nativeConfirm\(translateTextForLocale\(message,'en'\)\)/);
});

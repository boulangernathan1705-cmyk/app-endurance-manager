import fs from 'node:fs';

function replace(path, from, to) {
  const source=fs.readFileSync(path,'utf8');
  if(!source.includes(from)) throw new Error(`Pattern not found in ${path}: ${from.slice(0,140)}`);
  fs.writeFileSync(path,source.replace(from,to));
}

replace('index.html',
  '<header><div class="header-inner"><button class="brand-button logo" data-action="home" aria-label="Retour aux événements"><span class="brand-mark-frame" aria-hidden="true"><img class="brand-mark" src="/images/endurance-manager-logo.webp" alt=""></span><span class="brand-copy">ENDURANCE <span>MANAGER</span></span></button><nav id="navigation" aria-label="Navigation principale"></nav></div></header>\n<main id="app">',
  '<header><div class="header-inner"><button class="brand-button logo" data-action="home" aria-label="Retour aux événements"><span class="brand-mark-frame" aria-hidden="true"><img class="brand-mark" src="/images/endurance-manager-logo.webp" alt=""></span><span class="brand-copy">ENDURANCE <span>MANAGER</span></span></button></div></header>\n<div class="site-nav-shell"><nav id="navigation" aria-label="Navigation principale"></nav></div>\n<main id="app">');

replace('app.js',
  "    ${canManage()?button('create','+ Événement','','primary-button'):''}\n",
  '');

replace('app.js',
  '  app.innerHTML=`<h1 class="page-title">ÉVÉNEMENTS</h1>\n',
  '  app.innerHTML=`<h1 class="page-title">ÉVÉNEMENTS</h1>\n    ${canManage()?`<div class="home-create-event">${button(\'create\',\'Ajouter un évènement\',\'\',\'primary-button\')}</div>`:\'\'}\n');

replace('app.js',
  '    <div class="toolbar">${button(\'refresh\',\'Actualiser\')}${button(\'my-entries\',\'Mes inscriptions\')}${!user?button(\'guest-link\',\'Mon lien personnel\'):\'\'}</div>\n',
  '    <div class="toolbar home-toolbar">${button(\'refresh\',\'Actualiser\')}${button(\'my-entries\',\'Mes inscriptions\')}${!user?button(\'guest-link\',\'Mon lien personnel\'):\'\'}</div>\n');

const cssPath='styles/fmt-racing-theme.css';
let css=fs.readFileSync(cssPath,'utf8');
if(!css.includes('/* Header/navigation refinement for wide screens. */')) css += `\n\n/* Header/navigation refinement for wide screens. */\n.site-nav-shell {\n  position: relative;\n  z-index: 8;\n  width: min(calc(100% - 44px),1180px);\n  height: 0;\n  margin: 0 auto;\n}\n.site-nav-shell #navigation {\n  position: absolute;\n  top: 22px;\n  right: 0;\n  display: flex;\n  justify-content: flex-end;\n  align-items: center;\n  gap: 7px;\n  margin: 0;\n}\n.home-create-event {\n  margin: 7px 0 10px;\n}\n.home-create-event .primary-button {\n  min-width: 168px;\n}\n.home-toolbar { margin-top: 10px; }\n\n@media (min-width: 1800px) {\n  header {\n    background-size: cover;\n    background-position: center center;\n  }\n}\n\n@media (max-width: 700px) {\n  .site-nav-shell {\n    width: 100%;\n    height: auto;\n    margin: 0;\n    padding: 8px 10px 0;\n  }\n  .site-nav-shell #navigation {\n    position: static;\n    display: grid;\n    grid-template-columns: repeat(2,minmax(0,1fr));\n    gap: 6px;\n    width: 100%;\n    margin: 0;\n  }\n  .home-create-event { margin: 7px 0 10px; }\n  .home-create-event .primary-button { width: 100%; min-width: 0; }\n}\n`;
fs.writeFileSync(cssPath,css);

replace('index.html','/styles.css?v=33-fmt-racing-theme','/styles.css?v=34-header-nav-refine');
replace('index.html','/app.js?v=26-lock-categories-after-assignment','/app.js?v=27-header-nav-refine');

const STORAGE_KEY='endurance_manager_locale';
const SUPPORTED=new Set(['fr','en']);

const EN=new Map(Object.entries({
  'Accueil':'Home','Aide':'Help','Événements':'Events','ÉVÉNEMENTS':'EVENTS','Mes inscriptions':'My entries','MES INSCRIPTIONS':'MY ENTRIES',
  'Mon inscription':'My entry','Inscriptions':'Entries','Mes inscriptions personnelles':'My personal entries','Inscriptions que je gère':'Entries I manage',
  'Gestion des membres':'Member management','GESTION DES MEMBRES':'MEMBER MANAGEMENT','Membres':'Members','Diagnostics':'Diagnostics','DIAGNOSTICS':'DIAGNOSTICS',
  'Erreurs techniques':'Technical errors','AIDE':'HELP','AIDE PILOTE':'DRIVER HELP','ESPACE PILOTE':'DRIVER AREA','Pilote':'Driver','Pilotes':'Drivers',
  'Organisateur':'Organizer','Administrateur':'Administrator','Administrateur principal':'Primary administrator','Déconnexion':'Log out',
  'Se connecter avec Discord':'Sign in with Discord','Connexion Discord indisponible':'Discord sign-in unavailable','Compte indisponible':'Account unavailable',
  'Choisis ton simulateur':'Choose your simulator','Simulateurs disponibles':'Available simulators','Chargement de la prochaine endurance…':'Loading the next endurance event…',
  'Accéder à LMU':'Open LMU','Accéder à iRacing':'Open iRacing','COURSE EN COURS':'RACE IN PROGRESS','PROCHAIN DÉPART':'NEXT START','PROCHAINE ENDURANCE':'NEXT ENDURANCE',
  'Aucune endurance à venir':'No upcoming endurance events','Le prochain événement apparaîtra ici dès qu’il sera créé.':'The next event will appear here as soon as it is created.',
  'À venir':'Upcoming','Archivés':'Archived','Ajouter un évènement':'Add event','Ajouter un événement':'Add event','Mon lien personnel':'My personal link',
  'Copier le lien':'Copy link','Masquer':'Hide','Filtrer les événements':'Filter events','Aucun événement à venir.':'No upcoming events.','Aucun événement archivé.':'No archived events.',
  'Cette semaine':'This week','La semaine prochaine':'Next week','Dates à confirmer':'Dates to be confirmed','Date à confirmer':'Date to be confirmed',
  'Départ passé':'Start passed','· Départ passé':'· Start passed','Départs passés':'Past starts','Tous les départs ont eu lieu':'All starts have taken place',
  'Actualiser':'Refresh','Modifier l’événement':'Edit event','Supprimer l’événement':'Delete event','Départs de la course':'Race starts',
  'durée':'duration','départ':'start','départs':'starts','pilote':'driver','pilotes':'drivers','équipage':'crew','équipages':'crews','Équipage':'Crew','Équipages':'Crews',
  'ÉQUIPAGE COMPLET':'CREW COMPLETE','ÉQUIPAGE OUVERT':'CREW OPEN','Équipage complet':'Crew complete','Équipage ouvert':'Crew open','Ouvert':'Open','Complet':'Complete',
  'RESPONSABLE':'OWNER','Rejoindre':'Join','Quitter':'Leave','Gérer':'Manage','Modifier':'Edit','Supprimer':'Delete','Créer un équipage':'Create crew','Créer mon équipage':'Create my crew',
  'Pilotes sans équipage':'Drivers without a crew','Pilotes indisponibles':'Unavailable drivers','Aucun pilote affecté':'No driver assigned','Aucun équipage pour ce départ.':'No crew for this start.',
  'Aucun pilote inscrit sur ce départ.':'No driver registered for this start.','Disponibilité de l’équipage':'Crew availability','État de l’équipage':'Crew status',
  'Voiture à choisir':'Car to be chosen','Voiture à définir':'Car to be decided','En attente d’affectation':'Waiting for crew assignment','Aucune inscription.':'No entries.',
  'Voir l’événement complet':'View full event','Mon équipage':'My crew','Autres équipages':'Other crews','S’inscrire':'Register','Modifier mon inscription':'Edit my entry',
  'Inscrire un autre pilote':'Register another driver','Ajouter une catégorie':'Add a category','TON INSCRIPTION':'YOUR ENTRY','AUTRE PILOTE':'OTHER DRIVER','AJOUT D’UNE CATÉGORIE':'ADD A CATEGORY',
  'Heures de présence':'Availability hours','TOUTE LA COURSE':'WHOLE RACE','Toute la course':'Whole race','Indisponible':'Unavailable','Début':'Start','Milieu':'Middle','Fin':'End',
  'Catégorie':'Category','Voiture(s) souhaitée(s)':'Preferred car(s)','N’importe quelle voiture':'Any car','Pas de préférence':'No preference','Peu importe la voiture':'Any car',
  'Pilote souhaité':'Preferred driver','(facultatif)':'(optional)','Pseudo du pilote souhaité':'Preferred driver name','Pseudo pilote':'Driver name','Pilote Discord':'Discord driver',
  'ENREGISTRER':'SAVE','INSCRIRE LE PILOTE':'REGISTER DRIVER','S’INSCRIRE':'REGISTER','Supprimer l’inscription':'Delete entry','Se désinscrire':'Withdraw','Fermer':'Close',
  'Disponibilité':'Availability','Informations générales':'General information','Nom de l’événement':'Event name','Durée de la course':'Race duration','Type d’événement':'Event type',
  'Circuit':'Circuit','Sélectionner un circuit':'Select a circuit','Catégories autorisées':'Allowed categories','Départs possibles':'Available starts','+ Ajouter un départ':'+ Add start',
  'Supprimer ce départ':'Delete this start','Date':'Date','Heure (Paris)':'Time (Paris)','MODIFIER L’ÉVÉNEMENT':'EDIT EVENT','NOUVEL ÉVÉNEMENT':'NEW EVENT',
  'Mettre à jour la course':'Update the race','Préparer une nouvelle course':'Set up a new race','ENREGISTRER LES MODIFICATIONS':'SAVE CHANGES','CRÉER L’ÉVÉNEMENT':'CREATE EVENT',
  '← Retour':'← Back','← Retour aux événements':'← Back to events','Retour à l’accueil':'Back to home','Retour à l’accueil Endurance Manager':'Back to Endurance Manager home',
  '← Retour au site':'← Back to site','Chargement des événements…':'Loading events…','Chargement des membres…':'Loading members…','Chargement de l’aide…':'Loading help…',
  'Chargement des diagnostics…':'Loading diagnostics…','Navigation principale':'Main navigation','Navigation globale':'Global navigation','Changer de simulateur':'Change simulator',
  'Circuit à préciser':'Circuit to be confirmed','Championnat LMU':'LMU championship','Championnat privé':'Private championship','Accès impossible':'Access unavailable','Enregistrer':'Save',
  'À propos & sécurité':'About & security','À propos et sécurité':'About & security','Informations légales':'Legal information','Confidentialité':'Privacy','Crédits des circuits':'Circuit credits',
  'Le service':'The service','Connexion Discord':'Discord sign-in','Sécurité':'Security','Contact':'Contact','Un outil communautaire de simracing':'A community simracing tool',
  'Connexion avec Discord OAuth':'Sign in with Discord OAuth','Mesures de sécurité':'Security measures','Transparence et contact':'Transparency and contact',
  'Politique de confidentialité':'Privacy policy','Mentions légales':'Legal notice','Propriété intellectuelle':'Intellectual property','Marques et simulateurs':'Trademarks and simulators',
  'Données personnelles':'Personal data','Utilisation du service':'Use of the service','Action impossible':'Action unavailable','OK, j’ai compris':'OK, got it',
  'Aucun participant':'No participants','Aucune inscription pour ce départ':'No entry for this start','Aucun pilote inscrit':'No registered driver','Aucun équipage formé':'No crew formed'
}));

const PATTERNS=[
  [/^(\d+) pilote(?:s)? inscrit(?:s)?$/u,([,n])=>`${n} registered driver${n==='1'?'':'s'}`],
  [/^(\d+) pilote(?:s)?$/u,([,n])=>`${n} driver${n==='1'?'':'s'}`],
  [/^(\d+) équipage(?:s)?$/u,([,n])=>`${n} crew${n==='1'?'':'s'}`],
  [/^(\d+) événement(?:s)?$/u,([,n])=>`${n} event${n==='1'?'':'s'}`],
  [/^(\d+) inscription(?:s)?$/u,([,n])=>`${n} entr${n==='1'?'y':'ies'}`],
  [/^(\d+) membre(?:s)?$/u,([,n])=>`${n} member${n==='1'?'':'s'}`],
  [/^(\d+) départ(?:s)?$/u,([,n])=>`${n} start${n==='1'?'':'s'}`],
  [/^(\d+) pilote(?:s)? · (\d+) équipage(?:s)?$/u,([,d,c])=>`${d} driver${d==='1'?'':'s'} · ${c} crew${c==='1'?'':'s'}`],
  [/^Départ (.+) · Départ passé$/u,([,v])=>`Start ${v} · Start passed`],
  [/^Départ (.+)$/u,([,v])=>`Start ${v}`],
  [/^Heure (\d+)$/u,([,n])=>`Hour ${n}`],
  [/^Disponibilités de (.+)$/u,([,name])=>`${name}'s availability`],
  [/^Rôle de (.+)$/u,([,name])=>`Role for ${name}`],
  [/^Discord : (.+)$/u,([,v])=>`Discord: ${v}`],
  [/^Plus tard en (.+)$/u,([,v])=>`Later in ${v}`]
];

export function getLocale(){try{const value=globalThis.localStorage?.getItem(STORAGE_KEY);return SUPPORTED.has(value)?value:'fr';}catch{return'fr';}}
export function setLocale(locale){const value=SUPPORTED.has(locale)?locale:'fr';try{globalThis.localStorage?.setItem(STORAGE_KEY,value);}catch{}return value;}
export function localeTag(locale=getLocale()){return locale==='en'?'en-GB':'fr-FR';}
export function translateTextForLocale(value,locale=getLocale()){
  const source=String(value??'');if(locale!=='en'||!source.trim())return source;
  const match=source.match(/^(\s*)([\s\S]*?)(\s*)$/u),leading=match?.[1]||'',core=match?.[2]||source,trailing=match?.[3]||'';
  if(EN.has(core))return`${leading}${EN.get(core)}${trailing}`;
  for(const[pattern,replacer]of PATTERNS){const found=core.match(pattern);if(found)return`${leading}${replacer(found)}${trailing}`;}
  return source;
}
function translateTextNode(node){const parent=node.parentElement;if(!parent||parent.closest('[data-i18n-ignore],.account-name,script,style,code,pre,textarea'))return;const translated=translateTextForLocale(node.nodeValue,'en');if(translated!==node.nodeValue)node.nodeValue=translated;}
function translateAttributes(element){if(!(element instanceof Element)||element.closest('[data-i18n-ignore]'))return;for(const name of['aria-label','title','placeholder','alt']){if(!element.hasAttribute(name))continue;const current=element.getAttribute(name),translated=translateTextForLocale(current,'en');if(translated!==current)element.setAttribute(name,translated);}}
function translateTree(root){if(!root)return;if(root.nodeType===Node.TEXT_NODE){translateTextNode(root);return;}if(root.nodeType!==Node.ELEMENT_NODE&&root.nodeType!==Node.DOCUMENT_NODE)return;if(root.nodeType===Node.ELEMENT_NODE)translateAttributes(root);const walker=document.createTreeWalker(root,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT);let node=walker.nextNode();while(node){if(node.nodeType===Node.TEXT_NODE)translateTextNode(node);else translateAttributes(node);node=walker.nextNode();}}
function installStyles(){if(document.getElementById('endurance-language-style'))return;const style=document.createElement('style');style.id='endurance-language-style';style.textContent='.language-toggle{position:relative;z-index:120;display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;width:40px;height:40px;padding:0;border:1px solid rgba(88,113,118,.72);border-radius:11px;background:rgba(12,18,21,.92);color:#f4f7f6;box-shadow:0 8px 22px rgba(0,0,0,.18);font-size:20px;line-height:1;cursor:pointer}.language-toggle:hover,.language-toggle:focus-visible{border-color:rgba(113,211,216,.9);transform:translateY(-1px)}.account-bar>.language-toggle{margin-right:8px}.legal-header>.language-toggle{position:absolute;top:16px;right:16px}body>.language-toggle{position:fixed;top:12px;right:12px}@media(max-width:700px){.language-toggle{width:36px;height:36px;border-radius:10px;font-size:18px}.account-bar>.language-toggle{margin-right:6px}.legal-header>.language-toggle{top:18px;right:12px}}';document.head.append(style);}
function mountToggle(locale){if(document.querySelector('[data-language-toggle]'))return;const button=document.createElement('button');button.type='button';button.className='language-toggle';button.dataset.languageToggle='true';button.dataset.i18nIgnore='true';button.textContent=locale==='en'?'🇫🇷':'🇬🇧';button.setAttribute('aria-label',locale==='en'?'Switch site to French':'Passer le site en anglais');button.title=locale==='en'?'Français':'English';button.addEventListener('click',()=>{setLocale(locale==='en'?'fr':'en');location.reload();});const accountBar=document.querySelector('.account-bar');if(accountBar)accountBar.prepend(button);else{const legalHeader=document.querySelector('.legal-header');if(legalHeader)legalHeader.append(button);else document.body.append(button);}}
function initialiseBrowserI18n(){const locale=getLocale();document.documentElement.lang=locale;installStyles();mountToggle(locale);if(locale!=='en')return;document.title=translateTextForLocale(document.title,'en');translateTree(document.body);const observer=new MutationObserver(records=>{for(const record of records){if(record.type==='characterData')translateTextNode(record.target);else if(record.type==='attributes')translateAttributes(record.target);else for(const node of record.addedNodes)translateTree(node);}});observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['aria-label','title','placeholder','alt']});}
if(typeof document!=='undefined'){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialiseBrowserI18n,{once:true});else initialiseBrowserI18n();}

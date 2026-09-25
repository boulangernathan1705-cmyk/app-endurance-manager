const FLAG_BY_LOCALE={fr:'🇫🇷',en:'🇬🇧'};

function currentLocale(){return document.documentElement.lang==='en'?'en':'fr';}

function installLayoutStyles(){
  if(document.getElementById('endurance-language-layout-style'))return;
  const style=document.createElement('style');
  style.id='endurance-language-layout-style';
  style.textContent=`
    .game-space-bar>.language-toggle{
      width:36px;height:32px;border-radius:8px;font-size:18px;box-shadow:none;
      margin:0;background:rgba(12,18,21,.78)
    }
    .game-space-bar:has(>.language-toggle){justify-content:space-between}
  `;
  document.head.append(style);
}

function updateToggle(button){
  const locale=currentLocale();
  button.textContent=FLAG_BY_LOCALE[locale];
  button.dataset.currentLanguage=locale;
  button.setAttribute('aria-label',locale==='en'?'Change language. Current language: English':'Changer de langue. Langue actuelle : français');
  button.title=locale==='en'?'English · Change language':'Français · Changer de langue';
}

function placeToggle(){
  const button=document.querySelector('[data-language-toggle]');
  if(!button)return false;
  updateToggle(button);
  const gameSpace=document.querySelector('.game-space-bar');
  if(gameSpace){
    gameSpace.prepend(button);
    button.dataset.languagePlacement='game-space';
    return true;
  }
  return true;
}

function init(){
  installLayoutStyles();
  if(placeToggle())return;
  const observer=new MutationObserver(()=>{if(placeToggle())observer.disconnect();});
  observer.observe(document.documentElement,{subtree:true,childList:true});
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
else init();

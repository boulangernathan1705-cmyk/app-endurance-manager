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
    .hub-topbar>.language-toggle{
      grid-column:1;grid-row:1;justify-self:start;align-self:center;
      width:38px;height:38px;margin:0;box-shadow:none
    }
    @media(max-width:800px){
      .hub-topbar>.language-toggle{grid-column:1;grid-row:1;justify-self:start}
      .hub-topbar:has(>.language-toggle) .account-bar{grid-column:1;grid-row:1;justify-self:end}
      .hub-topbar:has(>.language-toggle) .hub-intro{grid-column:1;grid-row:2}
    }
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
  const hubTopbar=document.querySelector('.hub-topbar');
  if(hubTopbar){
    hubTopbar.prepend(button);
    button.dataset.languagePlacement='hub-topbar';
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

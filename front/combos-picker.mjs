import {carBrand} from '../shared/car-brands.mjs';
import {catalogForGame} from '../shared/catalog.mjs';
import {memoCandidates} from '../shared/memo-links.mjs';

const catalog = catalogForGame('lmu');
const fold = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('fr');
const circuits = new Map();

function trackImage(track) {
  if (!circuits.has(track)) {
    const circuit = catalog.circuits.find(item => !item.random && memoCandidates([{track}],new URLSearchParams({circuit:item.id})).length);
    circuits.set(track,circuit ? '/images/endurance/lmu-pano/'+circuit.id+'.webp' : '');
  }
  return circuits.get(track);
}

function category(combo) {
  const match = Object.keys(catalog.cars).find(key => catalog.cars[key].some(name => fold(name)===fold(combo.car)));
  const source = match || combo.carClass || '';
  if (/hypercar|^hy$|lmh|lmdh/i.test(source)) return 'Hypercar';
  if (/lmp2/i.test(source)) return 'LMP2';
  if (/lmp3/i.test(source)) return 'LMP3';
  if (/gt3/i.test(source)) return 'LMGT3';
  return source || 'Catégorie inconnue';
}
export function memoPicker({view,esc,comboKey,openCombo,dialog}) {
  function tile(kind, name, detail, attrs, combo) {
    const group=combo && category(combo);
    const brand=combo && carBrand(combo.car);
    let image=kind==='track' ? trackImage(name) : '';
    if (['Hypercar','LMP2','LMP3'].includes(group)) image='/images/memo-prototype.svg';
    if (['GTE','LMGT3'].includes(group)) image='/images/memo-gt.svg';
    const logo=brand?.logo ? `<img class="cb-brand" src="/images/brands/${brand.logo}.webp" alt="">` : '';
    return `<button type="button" class="cb-tile is-${kind}" ${attrs}>
      <span class="cb-tile-art">${image?`<img src="${image}" alt="" loading="lazy">`:''}</span>
      <span class="cb-tile-text"><small>${logo}${esc(detail)}</small><strong>${esc(name)}</strong></span>
      <span class="cb-tile-arrow" aria-hidden="true">⌄</span></button>`;
  }
  function header() {
    const c=view.combo;
    return `<div class="cb-selection">${tile('track',c.track,'Circuit','data-picker="track" aria-haspopup="dialog"')}${tile('car',c.car,'Voiture','data-picker="car" aria-haspopup="dialog"',c)}</div>`;
  }
  function show(kind,track=view.combo.track) {
    const quick=kind==='quick';
    const title=quick?'Accès rapides':kind==='track'?'Choisir un circuit':'Choisir une voiture';
    const box=dialog(title,`${kind==='car'?`<p>${esc(track)}</p>`:''}<input type="search" autofocus aria-label="Rechercher" placeholder="Rechercher…"><div class="cb-results"></div>`);
    const results=box.querySelector('.cb-results');
    const items=view.combos;
    const keyMap=new Map(items.map((item,i)=>[comboKey(item),i]));
    function draw(term='') {
      const sections=new Map();
      const matches=value=>fold(value).includes(fold(term.trim()));
      function add(group,html) {
        if(!sections.has(group))sections.set(group,[]);
        sections.get(group).push(html);
      }
      function car(item,group) {
        if(!item || !matches(item.car+' '+item.track+' '+category(item)))return;
        const selected=comboKey(item)===comboKey(view.combo);
        add(group,tile('car',item.car,(quick?item.track+' · ':'')+item.laps+' tours · '+item.drivers+' pilote'+(item.drivers===1?'':'s'),`data-choice="${keyMap.get(comboKey(item))}" aria-pressed="${selected}"`,item));
      }
      if(quick) {
        for(const key of view.favorites) car(items[keyMap.get(key)],'Favoris');
        for(const key of view.recent) car(items[keyMap.get(key)],'Récemment consultées');
      } else if(kind==='track') {
        const tracks=new Map();
        for(const item of items)tracks.set(item.track,(tracks.get(item.track)||0)+1);
        for(const [name,n] of [...tracks].sort(([a],[b])=>a.localeCompare(b,'fr'))) {
          if(matches(name))add('',tile('track',name,n+' voiture'+(n===1?'':'s'),`data-track-choice="${esc(name)}" aria-pressed="${name===view.combo.track}"`));
        }
      } else {
        const order=['Hypercar','LMP2','LMP3','LMGT3'];
        for(const group of order) sections.set(group,[]);
        for(const item of items.filter(item=>item.track===track).sort((a,b)=>a.car.localeCompare(b.car,'fr')))car(item,category(item));
      }
      results.innerHTML=[...sections].filter(([,tiles])=>tiles.length).map(([label,tiles])=>`${label?`<h3>${esc(label)}</h3>`:''}<div class="cb-tile-grid">${tiles.join('')}</div>`).join('') || '<p role="status">Aucun résultat.</p>';
    }
    draw();
    box.querySelector('input').oninput=event=>draw(event.target.value);
    results.onclick=event=>{
      const button=event.target.closest('button');
      if(!button)return;
      box.close();
      if(button.hasAttribute('data-choice')) {
        const item=items[Number(button.dataset.choice)];
        openCombo(item.track,item.car);
      } else {
        const track=button.dataset.trackChoice;
        if(items.some(item=>item.track===track && item.car===view.combo.car))openCombo(track,view.combo.car);
        else show('car',track);
      }
    };
  }
  return {header,show};
}

import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {posterModel,posterHtml,POSTER_FONTS,fontFaces} from '../../server/discord-poster.mjs';
// The morning posters as Cloudflare's browser (Chromium) takes them: a 100 px window and a full-page picture.
// Every case must be as tall as its content (2026-11-02: a one-race poster came out half empty), stay within its
// 720 px and never write under a logo.
// The poster's font, put inside the page as Cloudflare's run does.
const faces=fontFaces(POSTER_FONTS.map(({weight,path})=>({weight,data:readFileSync(new URL(`../..${path}`,import.meta.url)).toString('base64')})));
const img=path=>'data:image/png;base64,'+readFileSync(new URL(`../../images/${path}`,import.meta.url)).toString('base64');
const at=hour=>Date.parse('2026-11-02T00:00:00Z')+(hour-1)*3600000;
const site={name:'TDZ',url:'https://tdz.example',bannerUrl:'',streamUrl:'https://twitch.tv/streamer',streamName:'Le streamer',streams:[]};
const event=(more={})=>({kind:'event',url:'https://x/e',data:{id:'e',name:'TONDEUZ TRAINING',sim:'lmu',type:'TONDEUZ TRAINING',access:'open',tdz:true,logoUrl:img('event-access/open-lmu.png'),startsAt:at(18),entered:5,rounds:[{circuit:'spa'}],...more}});
const crews=count=>Array.from({length:count},(_,i)=>({name:String(i+1),pilots:['Pilote A','Pilote B','Pilote C']}));
const race=(more={})=>({kind:'race',url:'https://x/r',data:{name:'6h de Spa',circuit:'spa',durationMinutes:360,official:true,departures:[{startsAt:at(13),endsAt:at(19),crews:crews(1)}],...more}});
const stream={kind:'stream',url:'https://x/s',data:{id:'s',name:'Soirée stream',stream:{streamUrl:'https://twitch.tv/streamer',streamTime:'20:45'}}};
const cases={
  'one event':[[event()],false],
  'one endurance':[[race()],false],
  'ten crews':[[race({departures:[{startsAt:at(13),endsAt:at(19),crews:crews(10)}]})],false],
  'seven meetings':[[...Array.from({length:7},(_,i)=>event({id:'e'+i,startsAt:at(10+i)}))],false],
  'long name':[[event({name:'TONDEUZ TRAINING SPÉCIAL HALLOWEEN AVEC UN NOM BEAUCOUP TROP LONG POUR UNE LIGNE'})],false],
  'stream':[[stream],true],
  'two streams':[[event({id:'a',startsAt:at(14)}),event({id:'b',name:'OPEN LMU',type:'OPEN',startsAt:at(21)})],true,[{item:'a',time:'13:45'},{item:'b',time:'20:45'}]],
};
for(const [name,[items,live,streams=[]]] of Object.entries(cases))test(`morning poster « ${name} »: as tall as its content, within its width, nothing under a logo`,async({page},info)=>{
  test.skip(!info.project.name.startsWith('chromium'),'Cloudflare renders the posters with Chromium');
  await page.setViewportSize({width:720,height:100});
  await page.setContent(posterHtml(posterModel(items,{...site,streams},{live,timestamp:at(8)})).replace('<style>',`<style>${faces}`));
  const shot=await page.screenshot({fullPage:true});
  const layout=await page.evaluate(()=>{
    const card=document.querySelector('.card').getBoundingClientRect();
    const wide=[...document.querySelectorAll('.card *')].filter(item=>item.getBoundingClientRect().right>721).length;
    const under=[...document.querySelectorAll('.blk')].filter(block=>{
      const logo=block.querySelector('.lg');if(!logo)return false;const box=logo.getBoundingClientRect();
      return [...block.querySelectorAll('.name,.row > *')].some(item=>{const range=document.createRange();range.selectNodeContents(item);
        return [...range.getClientRects()].some(rect=>rect.right>box.left+2&&rect.left<box.right&&rect.top<box.bottom&&rect.bottom>box.top);});
    }).length;
    return {card:Math.round(card.height),wide,under};
  });
  expect(Math.abs(shot.readUInt32BE(20)-layout.card)).toBeLessThanOrEqual(1);
  expect(layout.wide).toBe(0);
  expect(layout.under).toBe(0);
});

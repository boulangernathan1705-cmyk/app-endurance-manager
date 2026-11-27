// Optional application-owned emojis, shared by recaps and voice cards. No guild setting or permission changes.
import {carBrand,CAR_BRAND_LOGOS} from '../shared/car-brands.mjs';
const HOUR=3600000, REFRESH=HOUR, RETRY=30*60000, MAX_BYTES=256*1024;
const cache=new Map(), brandLogos=new Set(CAR_BRAND_LOGOS);
function stateOf(env){
  const app=String(env?.DISCORD_CLIENT_ID||'');
  if(!app)return null;
  if(!cache.has(app))cache.set(app,{ids:null,readAt:0,retryAt:0,uploadAt:0,loading:null,uploading:null,assetRetry:new Map()});
  return cache.get(app);
}
const validId=id=>typeof id==='string' && /^\d+$/.test(id);
export function brandEmojiName(car){
  const logo=carBrand(car)?.logo;
  return logo&&brandLogos.has(logo)?`em_brand_${logo}`:'';
}
export function brandMark(car,emojis={}){
  const name=brandEmojiName(car),id=emojis?.[name];
  return name&&validId(id)?`<:${name}:${id}>`:'';
}
export function brandEmojiAsset(car){
  const name=brandEmojiName(car);
  return name?{name,path:`/images/brands/${name.slice(9)}.webp`,mime:'image/webp'}:null;
}
export function categoryEmojiAsset(name){
  return /^em_[a-z0-9_]+$/.test(name)&&!name.startsWith('em_brand_')?{name,path:`/images/discord-emojis/${name.slice(3)}.png`,mime:'image/png'}:null;
}
// The existing category loader already reads the application registry; reuse it across modules.
export function rememberDisplayEmojis(env,ids,now=Date.now()){
  const state=stateOf(env);
  if(!state)return;
  state.ids=Object.fromEntries(Object.entries(ids||{}).filter(([name,id])=>/^em_[a-z0-9_]+$/.test(name)&&validId(id)));
  state.readAt=now;state.retryAt=0;
}
export function knownDisplayEmojis(env){return stateOf(env)?.ids??null;}
export async function readDisplayEmojis(env,request,now=Date.now()){
  const state=stateOf(env);
  if(!state)return null;
  if(state.loading)return state.loading;
  if((state.ids&&now-state.readAt<REFRESH)||now<state.retryAt)return state.ids;
  state.loading=(async()=>{
    try{
      const list=await request('GET',`/applications/${env.DISCORD_CLIENT_ID}/emojis`);
      if(!Array.isArray(list?.items))throw new Error('Invalid emoji list');
      rememberDisplayEmojis(env,Object.fromEntries(list.items.map(item=>[item.name,item.id])),now);
    }catch{state.retryAt=now+RETRY;}
    return state.ids;
  })();
  try{return await state.loading;}finally{state.loading=null;}
}
function validAsset(bytes,mime){
  if(bytes.length<12||bytes.length>MAX_BYTES)return false;
  return mime==='image/webp'
    ? String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP'
    : mime==='image/png'&&bytes.slice(0,8).every((value,index)=>value===[137,80,78,71,13,10,26,10][index]);
}
// Same image upload for automatic publication and explicit DEV preview.
export async function uploadDisplayEmoji(env,asset,request){
  if(!env.ASSETS||!asset)return null;
  const file=await env.ASSETS.fetch(new Request(`${env.APP_ORIGIN||'https://endurance-manager.app'}${asset.path}`));
  if(!file.ok)return null;
  const bytes=new Uint8Array(await file.arrayBuffer());
  if(!validAsset(bytes,asset.mime))return null;
  let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
  const created=await request('POST',`/applications/${env.DISCORD_CLIENT_ID}/emojis`,{name:asset.name,image:`data:${asset.mime};base64,${btoa(binary)}`});
  return validId(created?.id)?created.id:null;
}
// At most one optional upload per application per half-hour per warm Worker, after a registry read.
// Failure never blocks an ordinary message or causes a guild-level emoji upload.
export async function registerOneDisplayEmoji(env,assets,request,now=Date.now()){
  const state=stateOf(env);
  if(!state?.ids||!env.ASSETS||state.uploading||now<state.uploadAt)return;
  const asset=assets.find(item=>item&&!state.ids[item.name]&&now>=(state.assetRetry.get(item.name)||0));
  if(!asset)return;
  state.uploadAt=now+RETRY;
  // A missing/bad asset must not monopolize all future logo attempts.
  state.assetRetry.set(asset.name,now+6*HOUR);
  state.uploading=(async()=>{
    try{
      const id=await uploadDisplayEmoji(env,asset,request);
      if(id)state.ids={...state.ids,[asset.name]:id};
    }catch{/* A missing logo is purely cosmetic. */}
  })();
  try{await state.uploading;}finally{state.uploading=null;}
}

import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {IRACING_ARTWORK} from '../front/endurance-card.mjs';
import {GAME_CATALOGS} from '../shared/catalog.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));

function uint24le(buffer,offset){return buffer[offset]|(buffer[offset+1]<<8)|(buffer[offset+2]<<16);}

function webpDimensions(buffer){
  if(buffer.length<30||buffer.toString('ascii',0,4)!=='RIFF'||buffer.toString('ascii',8,12)!=='WEBP') throw new Error('fichier WebP invalide');
  let offset=12;
  while(offset+8<=buffer.length){
    const type=buffer.toString('ascii',offset,offset+4);
    const size=buffer.readUInt32LE(offset+4);
    const data=offset+8;
    if(data+size>buffer.length) throw new Error(`chunk ${type} tronqué`);
    if(type==='VP8X'){
      if(size<10) throw new Error('chunk VP8X invalide');
      return {width:uint24le(buffer,data+4)+1,height:uint24le(buffer,data+7)+1};
    }
    if(type==='VP8 '){
      if(size<10||buffer[data+3]!==0x9d||buffer[data+4]!==0x01||buffer[data+5]!==0x2a) throw new Error('frame VP8 invalide');
      return {width:buffer.readUInt16LE(data+6)&0x3fff,height:buffer.readUInt16LE(data+8)&0x3fff};
    }
    if(type==='VP8L'){
      if(size<5||buffer[data]!==0x2f) throw new Error('frame VP8L invalide');
      const bits=buffer.readUInt32LE(data+1);
      return {width:(bits&0x3fff)+1,height:((bits>>14)&0x3fff)+1};
    }
    offset=data+size+(size%2);
  }
  throw new Error('dimensions WebP introuvables');
}

async function validateWebp(path,{minWidth=1,minHeight=1,maxBytes=Infinity,landscape=false}={}){
  const buffer=await readFile(root+path);
  const {width,height}=webpDimensions(buffer);
  if(width<minWidth||height<minHeight) throw new Error(`${path}: dimensions invalides ${width}×${height}`);
  if(landscape&&width<=height) throw new Error(`${path}: un panorama doit être horizontal`);
  if(buffer.length>maxBytes) throw new Error(`${path}: asset trop lourd ${(buffer.length/1024).toFixed(1)} KiB (maximum ${(maxBytes/1024).toFixed(1)} KiB)`);
  console.log(`Asset image OK: ${path} (${width}×${height}, ${(buffer.length/1024).toFixed(1)} KiB)`);
}

await validateWebp('images/endurance-manager-banner.webp',{minWidth:1900,minHeight:512,maxBytes:300000});

for (const sim of ['lmu','iracing']) await validateWebp(`images/endurance/${sim}.webp`,{minWidth:400,minHeight:250,maxBytes:100000});

for (const circuit of ['bahrain','barcelona','cota','daytona','fuji','imola','interlagos','laguna-seca','le-mans','long-beach','lusail','monza','paul-ricard','portimao','road-atlanta','sebring','silverstone','spa']) await validateWebp(`images/endurance/lmu/${circuit}.webp`,{minWidth:250,minHeight:250,maxBytes:180000});

for (const circuit of ['bahrain','barcelona','cota','daytona','fuji','imola','interlagos','laguna-seca','le-mans','long-beach','lusail','monza','paul-ricard','portimao','road-atlanta','sebring','silverstone','spa']) await validateWebp(`images/endurance/lmu-pano/${circuit}.webp`,{minWidth:400,minHeight:120,maxBytes:180000});

const validIracingIds=new Set(GAME_CATALOGS.iracing.circuits.filter(c=>!c.random&&!c.id.endsWith('-tbd')).map(c=>c.id));
const css=await readFile(root+'styles/pages/endurance-cards.css','utf8');
for(const [id,permission] of Object.entries(IRACING_ARTWORK)){
  if(!validIracingIds.has(id)||typeof permission!=='string'||!permission.trim()) throw new Error(`Registre iRacing invalide : ${id}`);
  const cover=`images/endurance/iracing/${id}.webp`;
  const pano=`images/endurance/iracing-pano/${id}.webp`;
  await validateWebp(cover,{minWidth:250,minHeight:250,maxBytes:180000});
  await validateWebp(pano,{minWidth:400,minHeight:120,maxBytes:180000,landscape:true});
  if(!css.includes('.endurance-card-head.endurance-track-'+id)||!css.includes('.endurance-pano.endurance-track-'+id)||!css.includes('.endurance-preview-track-'+id)||!css.includes('/'+cover)||!css.includes('/'+pano)) throw new Error(`Styles de circuit manquants : ${id}`);
}

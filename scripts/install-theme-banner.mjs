import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const dir='tmp/banner';
const chunks=fs.readdirSync(dir).filter(name=>/^[0-9]{2}\.txt$/.test(name)).sort();
if(chunks.length!==9) throw new Error(`Expected 9 banner chunks, found ${chunks.length}`);
const base64=chunks.map(name=>fs.readFileSync(path.join(dir,name),'utf8').trim()).join('');
const buffer=Buffer.from(base64,'base64');
if(buffer.toString('ascii',0,4)!=='RIFF'||buffer.toString('ascii',8,12)!=='WEBP') throw new Error('Decoded banner is not a WebP file');
if(buffer.length!==38862) throw new Error(`Unexpected banner size: ${buffer.length}`);
const hash=crypto.createHash('sha256').update(buffer).digest('hex');
if(hash!=='edffe4c1d6cab303a81ed5ef8a3839a1a20343f53589bf6dec099bacb66febdc') throw new Error(`Unexpected banner hash: ${hash}`);
fs.writeFileSync('images/endurance-manager-banner.webp',buffer);
console.log(`Installed images/endurance-manager-banner.webp (${buffer.length} bytes)`);

import {mkdir, copyFile, cp, writeFile, rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const out = new URL('../public/', import.meta.url);
await rm(out,{recursive:true,force:true});
await mkdir(out,{recursive:true});
for(const file of ['index.html','styles.css','app.js']) await copyFile(root+file,new URL(file,out));
await cp(root+'images',new URL('images/',out),{recursive:true});
if(!process.argv.includes('--workers')){
  await copyFile(root+'server/worker.mjs',new URL('_worker.js',out));
  await writeFile(new URL('_routes.json',out),JSON.stringify({version:1,include:['/api/*'],exclude:[]},null,2)+'\n');
}
await writeFile(new URL('_headers',out),`/*
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  X-Frame-Options: DENY
  Permissions-Policy: camera=(), microphone=(), geolocation=()
/
  Cache-Control: no-cache
/index.html
  Cache-Control: no-cache
/app.js
  Cache-Control: no-cache
/styles.css
  Cache-Control: no-cache
`);
console.log(`Build ready: public/ (${process.argv.includes('--workers')?'Workers':'Pages'})`);

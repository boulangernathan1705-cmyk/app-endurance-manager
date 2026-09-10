import './validate-image-assets.mjs';
import {mkdir, copyFile, cp, writeFile, rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const out = new URL('../public/', import.meta.url);
await rm(out,{recursive:true,force:true});
await mkdir(out,{recursive:true});
for(const file of ['index.html','styles.css','app.js','crew-accordion.css','crew-accordion.js','crew-builder.css','crew-builder.js','ux-refinement.css','ux-refinement.js','help.css','help-illustrations.css','help.js']) await copyFile(root+file,new URL(file,out));
await cp(root+'images',new URL('images/',out),{recursive:true});
await cp(root+'styles',new URL('styles/',out),{recursive:true});
await cp(root+'front',new URL('front/',out),{recursive:true});
await cp(root+'shared',new URL('shared/',out),{recursive:true});
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
/crew-accordion.js
  Cache-Control: no-cache
/crew-accordion.css
  Cache-Control: no-cache
/crew-builder.js
  Cache-Control: no-cache
/crew-builder.css
  Cache-Control: no-cache
/ux-refinement.js
  Cache-Control: no-cache
/ux-refinement.css
  Cache-Control: no-cache
/help.js
  Cache-Control: no-cache
/help.css
  Cache-Control: no-cache
/help-illustrations.css
  Cache-Control: no-cache
`);
console.log(`Build ready: public/ (${process.argv.includes('--workers')?'Workers':'Pages'})`);

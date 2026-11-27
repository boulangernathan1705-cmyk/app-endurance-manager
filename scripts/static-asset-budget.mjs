import {readdir,stat} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,relative,sep} from 'node:path';

export const STATIC_ASSET_LIMIT = 20_000;
export const STATIC_FILE_LIMIT = 25 * 1024 * 1024;
export const STATIC_ASSET_WARNING = 15_000;
export const IMAGE_BYTES_WARNING = 50 * 1024 * 1024;

// Each photo keeps its original pathname; only its own content hash changes.
export function createCircuitPhotoVersioner(root) {
  const versions = new Map();
  return (path, suffix = '') => {
    if (!/^images\/endurance\/(?:[a-z0-9-]+\/)*[a-z0-9-]+\.webp$/i.test(path)) return suffix;
    if (!versions.has(path)) versions.set(path, createHash('sha256').update(readFileSync(join(root,path))).digest('hex').slice(0,16));
    const url = new URL('/'+path+suffix,'https://assets.invalid');
    url.searchParams.set('v',versions.get(path));
    return url.search+url.hash;
  };
}

export async function staticAssetInventory(directory) {
  const files = [];
  async function visit(folder) {
    for (const entry of await readdir(folder,{withFileTypes:true})) {
      const full = join(folder,entry.name);
      if (entry.isDirectory()) await visit(full);
      else if (entry.isFile()) files.push({path:relative(directory,full).split(sep).join('/'),size:(await stat(full)).size});
    }
  }
  await visit(directory);
  return files;
}

export function checkStaticAssetBudget(files) {
  const errors = [], warnings = [];
  const imageBytes = files.filter(file=>file.path.startsWith('images/')).reduce((sum,file)=>sum+file.size,0);
  if (files.length > STATIC_ASSET_LIMIT) errors.push('Cloudflare Free: '+files.length+' fichiers, maximum '+STATIC_ASSET_LIMIT);
  else if (files.length >= STATIC_ASSET_WARNING) warnings.push('Cloudflare Free: seuil de vigilance de '+STATIC_ASSET_WARNING+' fichiers atteint');
  for (const file of files) if (file.size > STATIC_FILE_LIMIT) errors.push(file.path+' dépasse 25 Mio');
  if (imageBytes >= IMAGE_BYTES_WARNING) warnings.push('Le dossier images dépasse le seuil interne de 50 Mio');
  return {count:files.length,imageBytes,errors,warnings};
}

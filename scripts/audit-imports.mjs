import {readFile, readdir} from 'node:fs/promises';
import {join, relative} from 'node:path';
import {SourceTextModule} from 'node:vm';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = new URL('../', import.meta.url);
const files = await Promise.all(['front/', 'server/', 'shared/', 'relay/'].map(async folder => {
  const dir = new URL(folder, root);
  const entries = await readdir(dir, {recursive:true, withFileTypes:true});
  return entries.filter(entry => entry.isFile() && entry.name.endsWith('.mjs'))
    .map(entry => pathToFileURL(join(entry.parentPath, entry.name)));
}));
const graph = new Map();
for (const file of files.flat()) {
  // Parse modules without running them. Node 22.13 uses dependencySpecifiers.
  const module = new SourceTextModule(await readFile(file, 'utf8'), {identifier:file.href});
  const specifiers = module.moduleRequests?.map(request => request.specifier) ?? module.dependencySpecifiers;
  const imports = specifiers.filter(specifier => /^(?:\.{1,2}\/|\/(?!\/))/.test(specifier)).map(specifier => {
    const target = specifier.startsWith('/') ? new URL(specifier.slice(1), root) : new URL(specifier, file);
    target.search = '';
    target.hash = '';
    return target.href;
  });
  graph.set(file.href, imports);
}

const visited = new Set();
const active = new Set();
const stack = [];
const name = url => relative(fileURLToPath(root), fileURLToPath(url));
function visit(url) {
  if (active.has(url)) {
    throw new Error(`Cycle d’imports statiques : ${[...stack.slice(stack.indexOf(url)), url].map(name).join(' → ')}`);
  }
  if (visited.has(url) || !graph.has(url)) return;
  active.add(url);
  stack.push(url);
  for (const dependency of graph.get(url)) visit(dependency);
  stack.pop();
  active.delete(url);
  visited.add(url);
}
for (const url of graph.keys()) visit(url);
console.log(`Imports statiques : ${visited.size} modules contrôlés, aucun cycle.`);

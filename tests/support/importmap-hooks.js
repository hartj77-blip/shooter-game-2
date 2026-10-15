// Lets Node understand the same import names the browser does.
//
// In the browser, index.html has an "import map" that says
// `import ... from 'three'` means ./vendor/three/three.module.js.
// Node doesn't read import maps, so these hooks read the one in index.html
// and apply it. One map, used by both, so the two can never disagree.

import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const html = readFileSync(new URL('index.html', root), 'utf8');
const match = html.match(/<script type="importmap">([\s\S]*?)<\/script>/);
if (!match) throw new Error('No import map found in index.html');
const imports = JSON.parse(match[1]).imports;

export async function resolve(specifier, context, next) {
  if (imports[specifier]) return next(new URL(imports[specifier], root).href, context);
  for (const [prefix, target] of Object.entries(imports)) {
    if (prefix.endsWith('/') && specifier.startsWith(prefix)) {
      return next(new URL(target + specifier.slice(prefix.length), root).href, context);
    }
  }
  return next(specifier, context);
}

// Writes public/art/index.json: the list of art files present. Run automatically by the GitHub Pages workflow
// and by server.js; run `npm run art` yourself for other static hosts.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export function listArt(root) {
  const out = [];
  const walk = (dir, rel) => { if (!fs.existsSync(dir)) return; for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); const r = rel ? rel + '/' + e.name : e.name; if (e.isDirectory()) walk(p, r); else if (/\.(png|jpe?g|webp|svg)$/i.test(e.name)) out.push('art/' + r); } };
  walk(root, '');
  return out.sort();
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'art');
  fs.mkdirSync(root, { recursive: true });
  const files = listArt(root);
  fs.writeFileSync(path.join(root, 'index.json'), JSON.stringify(files));
  console.log(`art/index.json: ${files.length} file(s)`);
}

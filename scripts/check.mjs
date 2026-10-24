import { readdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
const files = [];
async function walk(dir) { for (const entry of await readdir(dir, { withFileTypes: true })) { const name = path.join(dir, entry.name); if (entry.isDirectory()) await walk(name); else if (/\.(mjs|js)$/.test(name)) files.push(name); } }
for (const dir of ['server', 'public', 'scripts']) await walk(dir);
try { await walk('tests'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
for (const file of files) { const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' }); if (result.status !== 0) { console.error(result.stderr); process.exit(1); } }
for (const file of ['facile', 'moyen', 'difficile']) { const text = await readFile(`src/words/${file}.txt`, 'utf8'); if (!text.trim()) throw new Error(`Dictionnaire vide : ${file}`); }
console.log(`Syntaxe vérifiée : ${files.length} modules. Les trois dictionnaires sont présents.`);

import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'dist');
if (path.dirname(output) !== path.resolve(root) || path.basename(output) !== 'dist') throw new Error('Répertoire de build inattendu.');
const rawApi = (process.env.KENSHOU_API_URL ?? '').trim();
let api = '';
if (rawApi) {
  const url = new URL(rawApi);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) throw new Error('KENSHOU_API_URL doit utiliser HTTPS (HTTP autorisé sur localhost).');
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('KENSHOU_API_URL doit être une origine seule, par exemple https://kenshou.onrender.com.');
  api = url.origin;
}
// Seul le répertoire dist du projet est remplacé ; les sources ne sont pas modifiées.
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(path.join(root, 'public'), output, { recursive: true });
const hookPath = path.join(output, 'hooks', 'useRoom.js');
let hook = await readFile(hookPath, 'utf8');
if (!hook.includes("const API_BASE = '';\nconst API_CONFIGURED = true;")) throw new Error('Configuration du client introuvable.');
hook = hook.replace("const API_BASE = '';\nconst API_CONFIGURED = true;", `const API_BASE = ${JSON.stringify(api)};\nconst API_CONFIGURED = ${Boolean(api)};`);
await writeFile(hookPath, hook);
await writeFile(path.join(output, '_headers'), `/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  X-Frame-Options: DENY\n  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'${api ? ` ${api}` : ''}; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'\n\n/hooks/useRoom.js\n  Cache-Control: no-cache\n`);
console.log('Build terminé : dist/ contient uniquement les fichiers publics du site.');
if (api) console.log(`Serveur multijoueur : ${api}`);
else console.warn('KENSHOU_API_URL non renseignée : le site est publiable, mais la création de salons sera désactivée jusqu’à la configuration du serveur Render et un nouveau déploiement.');

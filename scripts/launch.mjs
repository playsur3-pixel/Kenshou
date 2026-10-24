import { spawn } from 'node:child_process';
import { once } from 'node:events';

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('PORT doit etre un nombre entre 1 et 65535.'); process.exit(1);
}
const url = `http://localhost:${port}`;
async function isKenshou() {
  try {
    const response = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(1500) });
    if (!response.ok) return false;
    const health = await response.json();
    if (!health.ok) return false;
    if (health.app === 'kenshou') return true;
    // Compatibilité avec la toute première version déjà démarrée.
    const home = await fetch(url, { signal: AbortSignal.timeout(1500) });
    return home.ok && (await home.text()).includes('<title>Kenshou — Le poids des mots</title>');
  } catch { return false; }
}
function openBrowser() {
  if (process.env.KENSHOU_NO_BROWSER === '1') return;
  const command = process.platform === 'win32' ? 'rundll32.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = process.platform === 'win32' ? ['url.dll,FileProtocolHandler', url] : [url];
  const browser = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true });
  browser.on('error', () => console.log(`Ouvrez ${url} dans votre navigateur.`));
  browser.unref();
}
if (await isKenshou()) {
  console.log(`Kenshou est deja demarre : ${url}`);
  console.log('Vous pouvez fermer cette fenetre. Le serveur existant reste actif.');
  openBrowser();
} else {
  const { server } = await import('../server/index.mjs');
  if (!server.listening) await once(server, 'listening');
  console.log('Gardez cette fenetre ouverte pendant la partie.');
  openBrowser();
}

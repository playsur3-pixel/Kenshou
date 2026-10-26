const API_BASE = '';
const API_CONFIGURED = true;
// Un réveil vérifie uniquement la disponibilité ; la création du salon n’est jamais rejouée.
export async function waitForServer({ apiBase = API_BASE, onStatus = () => {}, signal, timeoutMs = 120000, attemptMs = 12000, retryMs = 2500, fetcher = fetch } = {}) {
  const started = Date.now();
  const elapsed = () => Math.floor((Date.now() - started) / 1000);
  const report = () => onStatus({ phase: Date.now() - started < 1500 ? 'checking' : 'waking', elapsed: elapsed() });
  const abortReason = () => signal?.reason ?? new DOMException('Réveil annulé.', 'AbortError');
  if (signal?.aborted) throw abortReason();
  report();
  const ticker = setInterval(report, 1000);
  try {
    while (Date.now() - started < timeoutMs) {
      if (signal?.aborted) throw abortReason();
      const attempt = new AbortController();
      const cancel = () => attempt.abort(abortReason());
      signal?.addEventListener('abort', cancel, { once: true });
      const timeout = setTimeout(() => attempt.abort(), Math.min(attemptMs, timeoutMs - (Date.now() - started)));
      try {
        const response = await fetcher(`${apiBase}/api/health`, { method: 'GET', cache: 'no-store', signal: attempt.signal });
        if ([400, 401, 403, 404].includes(response.status)) {
          const error = new Error(response.status === 403 ? 'Le serveur refuse la connexion à ce site. Vérifiez les origines autorisées sur Render.' : 'L’adresse du serveur multijoueur est incorrecte ou son accès est refusé.');
          error.permanent = true; throw error;
        }
        const health = response.ok ? await response.json().catch(() => null) : null;
        if (signal?.aborted) throw abortReason();
        if (health?.ok === true && health.app === 'kenshou') { onStatus({ phase: 'ready', elapsed: elapsed() }); return; }
      } catch (error) {
        if (signal?.aborted) throw abortReason();
        if (error.permanent) throw error;
        // Un délai, une page de démarrage Render ou une erreur réseau peuvent précéder le réveil.
      } finally { clearTimeout(timeout); signal?.removeEventListener('abort', cancel); }
      const remaining = timeoutMs - (Date.now() - started);
      if (remaining <= 0) break;
      await new Promise((resolve, reject) => {
        const cancel = () => { clearTimeout(timer); signal?.removeEventListener('abort', cancel); reject(abortReason()); };
        const timer = setTimeout(() => { signal?.removeEventListener('abort', cancel); resolve(); }, Math.min(retryMs, remaining));
        signal?.addEventListener('abort', cancel, { once: true });
        if (signal?.aborted) cancel();
      });
    }
    throw new Error('Le serveur ne répond pas après deux minutes. Réessayez dans quelques instants ; si cela persiste, vérifiez la connexion et la configuration Render.');
  } finally { clearInterval(ticker); }
}

// Une session par onglet permet aussi de tester plusieurs joueurs sur un navigateur.
export function useRoom(onState, onConnection, onError, onServerStatus = () => {}) {
  let session = null, controller = null, generation = 0, entryController = null, entryCanCancel = false;
  try { session = JSON.parse(sessionStorage.getItem('kenshou.session')); } catch { /* Stockage indisponible ou session périmée. */ }
  const save = () => { try { if (session) sessionStorage.setItem('kenshou.session', JSON.stringify(session)); else sessionStorage.removeItem('kenshou.session'); } catch { /* La session reste en mémoire. */ } };
  async function request(path, data, authenticated = false) {
    if (!API_CONFIGURED) throw new Error('Le serveur multijoueur n’est pas encore configuré pour ce site.');
    const response = await fetch(API_BASE + path, { signal: AbortSignal.timeout(20000), method: 'POST', headers: { 'Content-Type': 'application/json', ...(authenticated ? { Authorization: `Bearer ${session.token}` } : {}) }, body: JSON.stringify(data) });
    const result = await response.json().catch(() => ({ error: 'Le serveur multijoueur est indisponible. Vérifiez sa configuration.' })); if (!response.ok) throw new Error(result.error ?? 'Le serveur est indisponible.'); return result;
  }
  async function listen(current) {
    if (!API_CONFIGURED) { onConnection('offline'); onState(null); onError('Le serveur multijoueur n’est pas encore configuré pour ce site.'); return; }
    let delay = 800;
    while (session && current === generation) {
      controller = new AbortController(); onConnection('connecting');
      try {
        const response = await fetch(`${API_BASE}/api/events?room=${encodeURIComponent(session.room)}`, { headers: { Authorization: `Bearer ${session.token}` }, signal: controller.signal });
        if (!response.ok) { const result = await response.json(); if ([401, 404].includes(response.status)) { session = null; save(); onState(null); onError(result.error); return; } throw new Error(result.error); }
        onConnection('online'); delay = 800;
        const reader = response.body.getReader(), decoder = new TextDecoder(); let buffer = '';
        while (current === generation) {
          const { done, value } = await reader.read(); if (done) break;
          buffer += decoder.decode(value, { stream: true }); let end;
          while ((end = buffer.indexOf('\n\n')) >= 0) { const event = buffer.slice(0, end); buffer = buffer.slice(end + 2); if (event.startsWith('data: ')) onState(JSON.parse(event.slice(6))); }
        }
      } catch (error) { if (error.name === 'AbortError') return; }
      if (current !== generation || !session) return;
      onConnection('offline'); await new Promise(resolve => setTimeout(resolve, delay)); delay = Math.min(delay * 2, 8000);
    }
  }
  function connect() { generation++; controller?.abort(); if (session) void listen(generation); }
  return {
    resume: connect,
    async enter(name, code, rules) {
      if (entryController) throw new Error('Une connexion est déjà en cours.');
      const waking = new AbortController(); entryController = waking; entryCanCancel = true;
      try {
        if (!API_CONFIGURED) throw new Error('Le serveur multijoueur n’est pas encore configuré pour ce site.');
        await waitForServer({ signal: waking.signal, onStatus: onServerStatus });
        entryCanCancel = false;
        onServerStatus({ phase: code ? 'joining' : 'creating', elapsed: 0 });
        session = await request(code ? '/api/join' : '/api/rooms', { name, room: code, ...(code ? {} : { rules }) });
        save(); connect();
      } catch (error) {
        const cancelled = waking.signal.aborted;
        const message = cancelled ? 'Réveil annulé.' : ['TimeoutError', 'AbortError'].includes(error.name) ? 'Le serveur n’a pas confirmé l’ouverture du salon à temps. Réessayez dans quelques instants.' : error.message === 'Failed to fetch' ? 'Connexion au serveur impossible. Vérifiez votre connexion ou réessayez.' : error.message;
        onServerStatus({ phase: cancelled ? 'cancelled' : 'error', message });
        throw new Error(message);
      } finally { entryController = null; entryCanCancel = false; }
    },
    cancelEntry() { if (entryCanCancel) entryController?.abort(); },
    async action(type, data = {}) { if (!session) throw new Error('Rejoignez un salon.'); return request(`/api/action?room=${session.room}`, { type, data }, true); },
    async leave() { await this.action('leave'); generation++; controller?.abort(); session = null; save(); onState(null); },
    forget() { generation++; controller?.abort(); session = null; save(); onState(null); }
  };
}

const API_BASE = '';
const API_CONFIGURED = true;
// Une session par onglet permet aussi de tester plusieurs joueurs sur un navigateur.
export function useRoom(onState, onConnection, onError) {
  let session = null, controller = null, generation = 0;
  try { session = JSON.parse(sessionStorage.getItem('kenshou.session')); } catch { /* Stockage indisponible ou session périmée. */ }
  const save = () => { try { if (session) sessionStorage.setItem('kenshou.session', JSON.stringify(session)); else sessionStorage.removeItem('kenshou.session'); } catch { /* La session reste en mémoire. */ } };
  async function request(path, data, authenticated = false) {
    if (!API_CONFIGURED) throw new Error('Le serveur multijoueur n’est pas encore configuré pour ce site.');
    const response = await fetch(API_BASE + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(authenticated ? { Authorization: `Bearer ${session.token}` } : {}) }, body: JSON.stringify(data) });
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
    async enter(name, code, rules) { session = await request(code ? '/api/join' : '/api/rooms', { name, room: code, ...(code ? {} : { rules }) }); save(); connect(); },
    async action(type, data = {}) { if (!session) throw new Error('Rejoignez un salon.'); return request(`/api/action?room=${session.room}`, { type, data }, true); },
    async leave() { await this.action('leave'); generation++; controller?.abort(); session = null; save(); onState(null); },
    forget() { generation++; controller?.abort(); session = null; save(); onState(null); }
  };
}

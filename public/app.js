import { useRoom } from './hooks/useRoom.js';
import { useTimer } from './hooks/useTimer.js';
import { useSound } from './hooks/useSound.js';

const $ = (selector, root = document) => root.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const teamName = team => team === 'red' ? 'Rouge' : 'Bleue';
const icons = {
  settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="currentColor"/><circle cx="15" cy="17" r="3" fill="currentColor"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>', users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M16 3a4 4 0 0 1 0 8M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z"/>',
  crown: '<path d="m3 7 4 4 5-7 5 7 4-4-2 13H5L3 7Z"/>', play: '<path d="m8 5 11 7-11 7V5Z"/>', pause: '<path d="M8 5v14M16 5v14"/>',
  sound: '<path d="m11 5-6 4H2v6h3l6 4V5Zm5 3a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>', mute: '<path d="m11 5-6 4H2v6h3l6 4V5Zm6 4 5 6m0-6-5 6"/>',
  copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>', check: '<path d="m5 12 4 4L19 6"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>', alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6m0 4h.01"/>',
  up: '<path d="M7 10v11H3V10h4Zm0 0 5-8 2 1v6h6l1 2-3 10H7"/>', down: '<path d="M7 14V3H3v11h4Zm0 0 5 8 2-1v-6h6l1-2-3-10H7"/>',
  book: '<path d="M12 5C8 2 4 3 2 4v16c4-2 7-1 10 1 3-2 6-3 10-1V4c-4-2-7-1-10 1Zm0 0v16"/>', close: '<path d="m6 6 12 12M6 18 18 6"/>',
  leaf: '<path d="M20 3C6 2 2 9 6 16s16 0 14-13ZM4 21 16 9"/>', flag: '<path d="M5 21V3c5-5 9 5 14 0v10c-5 5-9-5-14 0"/>'
};
const icon = name => `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${icons[name] ?? icons.leaf}</svg>`;
const app = $('#app'), sound = useSound();
let state = null, connection = 'connecting', previous = null, settingsDraft = null, help = false, dismissedWinner = '', toastTimer, busy = false;
let entryStatus = { phase: 'idle', elapsed: 0 }, entryMode = 'create';
function serverStatusMarkup() {
  return `<div id="server-status" class="server-status" hidden><div class="server-status-main"><span class="server-status-dot" aria-hidden="true"></span><div role="status" aria-live="polite"><strong id="server-status-title"></strong><p id="server-status-description"></p></div></div><div class="server-status-bottom"><span id="server-status-elapsed" aria-live="off"></span><button class="text-button" type="button" data-action="cancel-wake" hidden>Annuler</button></div></div>`;
}
function paintEntryStatus() {
  const status = $('#server-status'), form = $('#entry-form');
  if (!status || !form) return;
  const phase = entryStatus.phase;
  const pending = ['checking', 'waking', 'ready', 'creating', 'joining'].includes(phase);
  const labels = {
    checking: ['Connexion au serveur…', 'Vérification de la disponibilité du serveur de jeu.'],
    waking: ['Réveil du serveur en cours…', 'Le serveur peut être en veille. Son démarrage peut prendre environ une minute. Gardez cette page ouverte.'],
    ready: ['Serveur disponible', 'Le serveur répond. Préparation de votre salon…'],
    creating: ['Serveur disponible · Création du salon…', 'Votre salon va s’ouvrir automatiquement.'],
    joining: ['Serveur disponible · Connexion au salon…', 'Vous allez retrouver les autres joueurs.'],
    error: ['Connexion impossible', entryStatus.message ?? 'Réessayez dans quelques instants.'],
    cancelled: ['Réveil annulé', 'Vous pouvez réessayer quand vous le souhaitez.']
  };
  status.hidden = phase === 'idle'; status.dataset.phase = phase;
  $('#server-status-title').textContent = labels[phase]?.[0] ?? '';
  $('#server-status-description').textContent = labels[phase]?.[1] ?? '';
  $('#server-status-elapsed').textContent = ['checking', 'waking'].includes(phase) ? `${entryStatus.elapsed ?? 0} s écoulée(s)` : '';
  $('[data-action="cancel-wake"]', status).hidden = !['checking', 'waking'].includes(phase);
  form.setAttribute('aria-busy', String(pending));
  for (const input of form.querySelectorAll('input')) input.disabled = pending;
  for (const button of form.querySelectorAll('button[type="submit"]')) {
    button.disabled = pending;
    button.innerHTML = pending && button.value === entryMode ? `${phase === 'checking' ? 'Connexion…' : ['ready', 'creating', 'joining'].includes(phase) ? 'Ouverture…' : 'Réveil en cours…'} ${icon('arrow')}` : button.value === 'create' ? `Créer un salon ${icon('arrow')}` : `Rejoindre ${icon('arrow')}`;
  }
}

function toast(message) { $('#toast').textContent = message; $('#toast').classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 5000); }
const timer = useTimer(() => state, (seconds, current) => {
  for (const element of document.querySelectorAll('#clock, #vote-clock')) { element.textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`; element.classList.toggle('urgent', current.playing && seconds <= 10); }
});
const room = useRoom(next => {
  if (next) {
    timer.sync(next);
    if (previous && (next.round !== previous.round || next.phase !== previous.phase)) sound.play(next.phase === 'finished' ? 'win' : next.phase === 'choice' ? 'round' : 'phase');
    previous = next;
  } else previous = null;
  state = next; entryStatus = { phase: 'idle', elapsed: 0 }; render();
}, next => { connection = next; const badge = $('#connection'); if (badge) { badge.textContent = next === 'online' ? 'En direct' : 'Reconnexion…'; badge.className = `connection ${next}`; } const banner = $('#connection-warning'); if (banner) banner.hidden = next === 'online'; }, toast, next => { entryStatus = next; paintEntryStatus(); });

function header(inRoom = false) {
  return `<header class="topbar"><a class="brand" href="/" aria-label="Kenshou, accueil"><img src="/favicon.svg" alt="" width="40" height="40"><span>kenshou<span class="brand-dot">.</span></span></a><div class="top-actions">${inRoom ? `<span id="connection" class="connection ${connection}">${connection === 'online' ? 'En direct' : 'Reconnexion…'}</span>` : '<span class="tag desktop-only">LE POIDS DES MOTS</span>'}<button class="icon-button" data-action="sound" aria-label="${sound.enabled ? 'Désactiver' : 'Activer'} les sons" title="${sound.enabled ? 'Désactiver' : 'Activer'} les sons">${icon(sound.enabled ? 'sound' : 'mute')}</button><button class="text-button settings-nav" data-action="settings" aria-label="Paramètres">${icon('settings')}<span>Paramètres</span></button><button class="text-button" data-action="help" aria-label="Les règles">${icon('book')}<span>Les règles</span></button></div></header>`;
}
function home() {
  const queryCode = new URLSearchParams(location.search).get('salon') ?? '';
  return `${header()}<main class="home"><div class="hero"><div class="eyebrow"><span class="tiny-line"></span> L’ART DE L’ESQUIVATION</div><h1>Chaque mot<br>peut être un <em>piège.</em></h1><p class="hero-description">Guidez votre équipe vers le bon mot.<br>Évitez ceux que vos adversaires vous réservent.</p><div class="hero-meta"><span>${icon('users')} 4 à 16 joueurs</span><span>${icon('sound')} Sur votre vocal préféré</span></div><div class="word-art" aria-hidden="true"><div class="orbit"></div><div class="art-label">CE QU’IL FAUT FAIRE DEVINER</div><div class="art-word">ÉCLIPSE<span>✳</span></div><div class="art-traps"><span>soleil</span><span>lune</span><span>ombre</span></div><div class="art-caption">L’art de dire… sans tout dire.</div></div></div><section class="entry-card"><div class="entry-identity"><img src="/favicon.svg" alt="Logo historique de Kenshou" width="68" height="68"><div><strong>KENSHOU</strong><span>L’art de l’esquivation !</span></div></div><div class="card-kicker">À VOUS DE JOUER</div><h2>La partie commence ici.</h2><p>Rassemblez vos amis. Le reste, c’est une histoire de mots.</p><form id="entry-form"><label for="nickname">Votre pseudo</label><input id="nickname" name="nickname" placeholder="Comment vous appelle-t-on ?" required minlength="2" maxlength="20" autocomplete="nickname"><button class="button primary full" type="submit" name="mode" value="create">Créer un salon ${icon('arrow')}</button><div class="divider"><span>ou rejoindre vos amis</span></div><label for="room-code">Code du salon</label><div class="join-row"><input id="room-code" name="code" value="${esc(queryCode)}" placeholder="A1B2C3" maxlength="6" pattern="[A-Fa-f0-9]{6}" autocapitalize="characters" autocomplete="off"><button class="button secondary" type="submit" name="mode" value="join">Rejoindre ${icon('arrow')}</button></div></form>${serverStatusMarkup()}<div class="entry-note"><span class="status-dot"></span> Gratuit. Sans compte. Juste entre vous.</div></section></main><footer class="home-footer"><span>UN SAGE. DES DISCIPLES. QUELQUES MOTS DE TROP.</span><span>Fait pour jouer ensemble <span class="accent">✳</span></span></footer>`;
}
function teamCard(team) {
  const me = state.players.find(p => p.id === state.me), players = state.players.filter(p => p.team === team), sage = players.find(p => p.role === 'sage'), disciples = players.filter(p => p.role === 'disciple');
  const lobby = state.phase === 'lobby';
  const playerRow = (p, role) => p ? `<div class="player-row"><span class="avatar">${esc(p.name.slice(0, 1).toUpperCase())}</span><div class="player-name">${esc(p.name)} ${p.id === state.me ? '<span class="you">vous</span>' : ''}<small>${role}${p.id === state.hostId ? ' · Hôte' : ''}</small></div><span class="player-status ${p.connected ? 'on' : ''}" title="${p.connected ? 'Connecté' : 'Déconnecté'}"></span></div>` : `<div class="empty-player">${icon('crown')} En attente d’un sage</div>`;
  return `<section class="team-card ${team}"><div class="team-heading"><span class="team-mark">${icon('crown')}</span><div><span class="card-kicker">${me.team === team ? 'VOTRE ÉQUIPE' : me.team ? 'ÉQUIPE ADVERSE' : 'CHOISISSEZ VOTRE CAMP'}</span><h2>Équipe ${teamName(team)}</h2></div><span class="count">${players.length}</span></div><div class="role-label">${icon('crown')} LE SAGE</div>${playerRow(sage, 'Fait deviner le mot')}<div class="role-label">${icon('users')} LES DISCIPLES</div>${disciples.length ? disciples.map(p => playerRow(p, 'Devine le mot')).join('') : '<div class="empty-player">La place est libre. À vous de jouer.</div>'}${lobby ? `<div class="seat-actions"><button class="button small secondary" data-action="seat" data-team="${team}" data-role="sage" ${sage && sage.id !== me.id ? 'disabled' : ''}>${icon('crown')} Sage</button><button class="button small secondary" data-action="seat" data-team="${team}" data-role="disciple">${icon('users')} Disciple</button></div>` : ''}</section>`;
}
const phases = ['choice', 'traps', 'oration'];
function stage() {
  const me = state.players.find(p => p.id === state.me), own = state.own, lobby = state.phase === 'lobby';
  const phaseIndex = state.phase === 'choice' ? 0 : state.phase === 'traps' ? 1 : ['readyRed', 'readyBlue', 'oration'].includes(state.phase) ? 2 : -1;
  const title = { lobby: 'Les esprits se rassemblent.', choice: 'Choisissez leur défi.', traps: 'Tendez vos pièges.', readyRed: 'Au sage rouge de jouer.', readyBlue: 'Au sage bleu de jouer.', oration: `Le sage ${state.activeTeam === 'red' ? 'rouge' : 'bleu'} a la parole.`, roundEnd: 'Les mots ont parlé.', finished: 'Une dernière révérence.' }[state.phase];
  let content;
  if (lobby) content = `<div class="stage-empty"><div class="zen-mark">${icon('leaf')}</div><h3>Un peu de calme avant les mots.</h3><p>Choisissez une équipe et votre rôle.<br>Un sage et au moins un disciple de chaque côté.</p><div class="readiness ${state.canStart ? 'ready' : ''}"><span class="status-dot"></span>${state.canStart ? 'Tout le monde est prêt. À vous de lancer la partie.' : 'En attente des joueurs et de leurs rôles…'}</div></div>`;
  else if (['roundEnd', 'finished'].includes(state.phase)) content = `<div class="round-results">${['red', 'blue'].map(team => `<div class="result ${team}"><span class="card-kicker">ÉQUIPE ${teamName(team).toUpperCase()}</span><h3>${state.results[team]?.success ? 'Mot trouvé !' : 'Mot manqué'}</h3><strong>${esc(state.results[team]?.word)}</strong><p>${esc(state.results[team]?.reason)}</p></div>`).join('')}</div><p class="center muted">${state.phase === 'finished' ? 'La partie est terminée. Rejouez pour prendre votre revanche.' : 'La manche est terminée. Cliquez sur Jouer pour continuer.'}</p>`;
  else {
    const isOrating = state.phase === 'oration', active = state.activeTeam === me.team;
    let word = own?.word ?? 'En attente', wordLabel = 'LE MOT CHOISI POUR L’ADVERSAIRE', wordHint = 'Seule votre équipe voit ce mot.';
    if (isOrating && active) { word = state.secret ?? 'À vous de le deviner'; wordLabel = me.role === 'sage' ? 'VOTRE MOT À FAIRE DEVINER' : 'ÉCOUTEZ VOTRE SAGE'; wordHint = me.role === 'sage' ? 'Faites deviner ce mot. Attention aux pièges inconnus !' : 'Vos propositions sont communes à toute l’équipe.'; }
    if (state.phase.startsWith('ready')) { wordHint = 'Le prochain sage découvrira son mot au lancement du décompte.'; }
    content = `<div class="secret-word"><span class="card-kicker">${wordLabel}</span><h3 class="${isOrating && active && me.role !== 'sage' ? 'hidden-word' : ''}">${esc(word)}</h3><p>${wordHint}</p>${state.phase === 'choice' ? `<span class="tag">${own.locked ? 'Mot validé' : 'Vote en cours'} · ${state.rules.rerolls - own.rerolls} reroll(s) restant(s)</span>` : ''}</div><div class="traps-heading"><span>${icon('alert')} Vos mots piégés</span><span>${own?.traps.length ?? 0} / ${state.rules.traps}</span></div><div class="trap-grid ${state.rules.traps > 8 ? 'compact' : ''}">${Array.from({ length: state.rules.traps }, (_, i) => {
      const trap = own?.traps[i];
      return trap ? `<div class="trap"><button class="trap-icon" data-action="${state.phase === 'traps' ? 'removeTrap' : 'claim'}" data-id="${trap.id}" aria-label="${state.phase === 'traps' ? 'Supprimer' : 'Signaler'} le mot ${esc(trap.word)}" ${!(state.playing && (state.phase === 'traps' || isOrating && !active)) ? 'disabled' : ''}>${icon(state.phase === 'traps' ? 'trash' : 'alert')}</button><div><strong>${esc(trap.word)}</strong><small>${esc(trap.author)}</small></div></div>` : `<div class="trap empty"><span>${String(i + 1).padStart(2, '0')}</span><span>${state.phase === 'traps' ? 'Un piège à inventer' : 'Emplacement libre'}</span></div>`;
    }).join('')}</div>`;
    if (state.phase === 'traps') content += `<form id="word-form" class="word-form"><label class="sr-only" for="word-input">Ajouter un mot piégé</label><input id="word-input" name="word" placeholder="Un mot qu’ils ne devront pas prononcer…" maxlength="40" required ${!state.playing || own.traps.length >= state.rules.traps ? 'disabled' : ''}><button class="button primary" type="submit" ${!state.playing || own.traps.length >= state.rules.traps ? 'disabled' : ''}>Piéger ${icon('arrow')}</button></form>`;
    else if (isOrating && active && me.role === 'disciple') content += `<form id="word-form" class="word-form"><label class="sr-only" for="word-input">Votre proposition</label><input id="word-input" name="word" placeholder="Quel mot votre sage fait-il deviner ?" maxlength="40" required ${!state.playing ? 'disabled' : ''}><button class="button primary" type="submit" ${!state.playing ? 'disabled' : ''}>Proposer ${icon('arrow')}</button></form><p class="input-hint">${state.guesses.length} / ${state.rules.guesses} propositions utilisées par votre équipe</p>`;
    else if (isOrating) content += `<div class="oration-hint">${icon(active ? 'sound' : 'alert')} ${active ? 'Vous avez la parole. Vos disciples saisissent leurs propositions.' : 'Écoutez le sage adverse. Signalez un piège s’il prononce l’un de vos mots.'}</div>`;
  }
  return `<section class="stage panel"><div class="stage-top"><div><span class="card-kicker">ZONE DE JEU ${state.round ? `· MANCHE ${state.round}` : ''}</span><h2>${title}</h2></div><div class="timer"><strong id="clock">00:00</strong><span>${state.playing ? 'DÉCOMPTE EN COURS' : 'EN PAUSE'}</span></div></div><div class="phase-track">${['Choix du mot', 'Mots piégés', 'Oration'].map((name, i) => `<div class="phase-step ${phaseIndex === i ? 'active' : phaseIndex > i ? 'done' : ''}"><span>${phaseIndex > i ? icon('check') : `0${i + 1}`}</span><strong>${name}</strong></div>`).join('')}</div><div class="stage-content">${content}</div></section>`;
}
function history() {
  return `<section class="history panel"><div class="section-heading"><h2>Le fil de la partie</h2><span class="tag">HISTORIQUE</span></div><div class="history-list">${state.history.length ? state.history.slice().reverse().map(item => `<div class="history-item ${item.kind}"><span class="history-dot"></span><div>${item.kind === 'event' ? `<strong>${esc(item.text)}</strong>` : `<span>${esc(item.text)}</span>`}<time>${new Date(item.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</time></div></div>`).join('') : '<div class="history-placeholder">Tout commence par un premier mot.<br>Les événements et propositions apparaîtront ici.</div>'}</div></section>`;
}
function game() {
  const me = state.players.find(p => p.id === state.me), control = me.id === state.hostId || me.role === 'sage', unassigned = state.players.filter(p => !p.team);
  return `${header(true)}<main class="room"><div id="connection-warning" class="connection-warning" ${connection === 'online' ? 'hidden' : ''}>Connexion interrompue. Reconnexion automatique en cours… <button class="text-button" data-action="forget">Retour à l’accueil</button></div><div class="room-title"><div><div class="eyebrow">L’ART DE L’ESQUIVATION · ENTRE AMIS</div><h1>Votre salon<span class="accent">.</span></h1></div><button class="room-code" data-action="copy" title="Copier le lien d’invitation"><span>SALON PRIVÉ</span><strong>${state.code}</strong>${icon('copy')}</button></div><div class="scoreboard"><div class="score-team red"><span class="color-dot"></span> Équipe Rouge <strong>${state.scores.red}</strong></div><div class="score-divider"><span>OBJECTIF</span><strong>${state.rules.targetScore} points</strong></div><div class="score-team blue"><strong>${state.scores.blue}</strong> Équipe Bleue <span class="color-dot"></span></div></div><div class="game-layout"><aside class="team-column">${teamCard('red')}${teamCard('blue')}${unassigned.length ? `<div class="waiting"><span class="card-kicker">DANS LE VESTIAIRE</span><p>${unassigned.map(p => `${esc(p.name)}${p.id === me.id ? ' (vous)' : ''}`).join(', ')}</p>Choisissez une équipe pour entrer en jeu.</div>` : ''}<div class="voice-note">${icon('sound')}<p>Retrouvez-vous sur Discord.<br>Les disciples gardent le silence.</p></div></aside><div class="play-column">${stage()}<div class="controls"><button class="text-button" data-action="rules">${icon('book')} Règles du salon</button><div class="control-actions">${state.phase === 'lobby' ? '<button class="text-button" data-action="leave">Quitter</button>' : ''}${state.phase === 'finished' ? `<button class="button primary" data-action="replay" ${!control ? 'disabled' : ''}>Rejouer ${icon('arrow')}</button>` : `<button class="button primary" data-action="${state.playing ? 'pause' : 'play'}" ${!control || state.trapClaim || !state.playing && !state.canStart ? 'disabled' : ''}>${icon(state.playing ? 'pause' : 'play')}${state.playing ? 'Pause' : state.phase === 'lobby' ? 'Jouer' : ['choice', 'traps', 'oration'].includes(state.phase) ? 'Reprendre' : 'Jouer'}</button>`}</div></div><p class="control-caption">${control ? 'L’hôte et les sages pilotent le décompte.' : 'L’hôte ou un sage lancera la prochaine phase.'}</p>${history()}</div></div></main><footer class="room-footer">CHOISISSEZ VOS MOTS AVEC SAGESSE. <span class="accent">✳</span></footer>`;
}

const choices = { choiceSeconds: [10, 20, 30, 45, 60], trapSeconds: [30, 60, 90, 120, 180], orationSeconds: [30, 60, 90, 120, 180], rerolls: [0, 1, 2, 3, 4, 5], traps: [3, 4, 5, 6, 8, 10, 12], guesses: [3, 4, 5, 6, 8, 10], targetScore: [1, 3, 5, 7, 10] };
const ruleNames = { choiceSeconds: 'Choix du mot', trapSeconds: 'Mots piégés', orationSeconds: 'Oration', rerolls: 'Rerolls par équipe', traps: 'Mots piégés par équipe', guesses: 'Propositions par équipe', targetScore: 'Score à atteindre' };
const defaultRules = { choiceSeconds: 20, trapSeconds: 90, orationSeconds: 120, rerolls: 2, traps: 6, guesses: 5, targetScore: 3, noTiePoint: true, medium: true, hard: false };
let settingsScope = null;
function savedRules() {
  let stored = {};
  try { stored = JSON.parse(localStorage.getItem('kenshou.rules')) ?? {}; } catch { /* Préférences standard. */ }
  const rules = { ...defaultRules };
  for (const [key, values] of Object.entries(choices)) if (values.includes(stored[key])) rules[key] = stored[key];
  for (const key of ['noTiePoint', 'medium', 'hard']) if (typeof stored[key] === 'boolean') rules[key] = stored[key];
  return rules;
}
function canEditSettings() { return !state || state.phase === 'lobby' && state.me === state.hostId; }
function readSettings(form) {
  const data = new FormData(form), rules = {};
  for (const key of Object.keys(choices)) rules[key] = Number(data.get(key));
  for (const key of ['medium', 'hard']) rules[key] = data.has(key);
  rules.noTiePoint = data.get('scoring') === 'cancel';
  return rules;
}
function settingsSummary(rules) {
  return `<div class="summary-goal"><strong>${rules.targetScore}</strong><span>point${rules.targetScore > 1 ? 's' : ''} pour gagner</span></div><dl><div><dt>Dictionnaires</dt><dd>${['Courants', ...(rules.medium ? ['Intermédiaires'] : []), ...(rules.hard ? ['Rares'] : [])].join(' + ')}</dd></div><div><dt>Durée des phases</dt><dd>${rules.choiceSeconds} / ${rules.trapSeconds} / ${rules.orationSeconds} s</dd></div><div><dt>Par équipe</dt><dd>${rules.traps} pièges · ${rules.guesses} propositions<br>${rules.rerolls} reroll(s)</dd></div><div><dt>Deux mots trouvés</dt><dd>${rules.noTiePoint ? 'Aucun point' : '1 point par équipe'}</dd></div></dl>`;
}
function settingsPage() {
  const editable = canEditSettings(), scope = state?.code ?? 'local';
  if (!settingsDraft || settingsScope !== scope) { settingsDraft = { ...(state?.rules ?? savedRules()) }; settingsScope = scope; }
  const rules = editable ? settingsDraft : state.rules;
  const select = key => `<select id="setting-${key}" name="${key}" ${!editable ? 'disabled' : ''}>${choices[key].map(value => `<option value="${value}" ${rules[key] === value ? 'selected' : ''}>${value}${key.endsWith('Seconds') ? ' secondes' : key === 'targetScore' ? ` point${value > 1 ? 's' : ''}` : ''}</option>`).join('')}</select>`;
  return `${header(Boolean(state))}<main class="settings-page"><button class="text-button settings-back" data-action="settings-back">${icon('arrow')} ${state ? 'Retour au salon' : 'Retour à l’accueil'}</button><div class="settings-heading"><div><div class="eyebrow">${state ? `SALON ${state.code}` : 'À VOTRE FAÇON'}</div><h1>Votre partie, vos règles<span class="accent">.</span></h1><p>Réglez la difficulté, le rythme et la course à la victoire.</p></div><span class="tag">${state ? 'RÈGLES DU SALON' : 'PROCHAINS SALONS'}</span></div><div class="settings-notice">${state ? editable ? 'Vous êtes l’hôte. Vos réglages s’appliquent à tous les joueurs de ce salon avant le lancement.' : state.phase !== 'lobby' ? 'La partie a commencé : les règles sont verrouillées jusqu’à la prochaine partie.' : 'Seul l’hôte peut modifier ces paramètres. Vous pouvez consulter les règles du salon.' : 'Enregistrez vos préférences : elles seront utilisées pour vos prochains salons créés sur ce navigateur.'}</div><div class="settings-layout"><form id="settings-form"><section class="settings-card panel"><div class="settings-section-title"><span class="settings-section-icon">${icon('flag')}</span><div><h2>La victoire</h2><p>Définissez l’objectif et le partage des points.</p></div></div><label class="settings-field" for="setting-targetScore"><span>Points pour remporter la partie<small>Le score est mis à jour après le passage des deux sages.</small></span>${select('targetScore')}</label><fieldset class="scoring-options" ${!editable ? 'disabled' : ''}><legend>Si les deux équipes trouvent leur mot</legend><label class="setting-option"><input id="setting-cancel" type="radio" name="scoring" value="cancel" ${rules.noTiePoint ? 'checked' : ''}><span><strong>Aucun point</strong><small>L’égalité annule les points de la manche.</small></span></label><label class="setting-option"><input id="setting-award" type="radio" name="scoring" value="award" ${!rules.noTiePoint ? 'checked' : ''}><span><strong>Un point par équipe</strong><small>Chaque réussite compte. Un match nul final est possible.</small></span></label></fieldset></section><section class="settings-card panel"><div class="settings-section-title"><span class="settings-section-icon">${icon('book')}</span><div><h2>La difficulté des mots</h2><p>Choisissez les dictionnaires utilisés pour le tirage.</p></div></div><label class="dictionary-option fixed"><input type="checkbox" checked disabled><span><strong>Mots courants</strong><small>Des mots familiers, accessibles à tous.</small></span><span class="tag">TOUJOURS INCLUS</span></label>${[['medium', 'Mots intermédiaires', 'Des mots moins fréquents pour varier les défis.'], ['hard', 'Mots rares', 'Un vocabulaire plus exigeant pour les amateurs de défis.']].map(([key, name, description]) => `<label class="dictionary-option"><input id="setting-${key}" name="${key}" type="checkbox" ${rules[key] ? 'checked' : ''} ${!editable ? 'disabled' : ''}><span><strong>${name}</strong><small>${description}</small></span></label>`).join('')}</section><section class="settings-card panel"><div class="settings-section-title"><span class="settings-section-icon">${icon('play')}</span><div><h2>Le rythme de la partie</h2><p>Chaque phase dispose de son propre décompte.</p></div></div>${['choiceSeconds', 'trapSeconds', 'orationSeconds'].map((key, index) => `<label class="settings-field" for="setting-${key}"><span><span class="phase-number">0${index + 1}</span>${ruleNames[key]}<small>${['Choisir le mot du sage adverse.', 'Préparer les mots que le sage devra éviter.', 'Faire deviner le mot à ses disciples.'][index]}</small></span>${select(key)}</label>`).join('')}</section><section class="settings-card panel"><div class="settings-section-title"><span class="settings-section-icon">${icon('users')}</span><div><h2>Les limites par équipe</h2><p>Des ressources communes à tous les coéquipiers.</p></div></div>${['rerolls', 'traps', 'guesses'].map((key, index) => `<label class="settings-field" for="setting-${key}"><span>${ruleNames[key]}<small>${['Nombre de changements de mot autorisés en phase 1.', 'Nombre maximum de mots piégés en phase 2.', 'Nombre maximum de réponses des disciples en phase 3.'][index]}</small></span>${select(key)}</label>`).join('')}</section><div class="settings-actions">${editable ? `<button class="text-button" type="button" data-action="settings-reset">Rétablir les valeurs standard</button><button class="button primary" type="submit">${icon('check')} Enregistrer les paramètres</button>` : '<button class="button secondary" type="button" data-action="settings-back">Retour au salon</button>'}</div></form><aside class="settings-summary panel"><span class="card-kicker">VOTRE PARTIE EN UN COUP D’ŒIL</span><h2>Le récapitulatif</h2><div id="settings-summary-content">${settingsSummary(rules)}</div><p>${editable ? 'Les changements sont appliqués après enregistrement.' : 'Ces règles sont celles de la partie en cours.'}</p></aside></div></main>`;
}
function helpModal() {
  return `<dialog id="help-dialog" class="modal help-modal"><button class="modal-close icon-button" data-action="close-help" aria-label="Fermer l’aide">${icon('close')}</button><span class="card-kicker">L’ART DE DIRE SANS TOUT DIRE</span><h2>Bienvenue au dojo.</h2><p>Deux équipes. Un sage et au moins un disciple de chaque côté. Rejoignez un vocal Discord : les sages parlent, les disciples répondent par écrit.</p><ol class="help-steps"><li><strong>Choisissez leur mot.</strong><p>Votez pour le mot que devra faire deviner le sage adverse. À deux par équipe, le sage décide. Une majorité absolue valide ou change le mot ; sans majorité à la fin du temps, le mot courant est conservé. Après le dernier reroll, il est imposé.</p></li><li><strong>Tendez vos pièges.</strong><p>Choisissez ensemble les mots que le sage adverse ne devra pas prononcer. Chacun peut ajouter et supprimer les pièges de son équipe. Cette phase suit automatiquement la première.</p></li><li><strong>À vous de deviner.</strong><p>Cliquez sur Jouer pour le sage rouge, puis à nouveau pour le sage bleu. Seul le sage actif découvre le mot adverse. Ses disciples ont un nombre de propositions commun à toute l’équipe. Les accents et la casse sont ignorés, pas les pluriels.</p></li></ol><p>Un mot piégé prononcé ? L’équipe adverse le signale. Le temps s’arrête et l’un des deux sages accepte ou annule. Un piège annulé relance le décompte.</p><p>Un mot trouvé vaut un point, attribué après les deux passages. Selon les règles, une égalité peut annuler les deux points. La première équipe à l’objectif gagne ; si les deux l’atteignent ensemble, c’est un match nul.</p><button class="button primary full" data-action="close-help">J’ai compris ${icon('check')}</button></dialog>`;
}
function voteModal() {
  const own = state.own;
  return `<dialog id="vote-dialog" class="modal vote-modal"><span class="card-kicker">PHASE 01 · VOTRE ÉQUIPE SEULEMENT</span><h2>Un bon défi pour eux ?</h2><p>Ce sera le mot à faire deviner au sage adverse.</p><div class="vote-word">${esc(own.word)}</div><div class="vote-buttons"><button class="button secondary ${own.myVote === false ? 'chosen' : ''}" data-action="vote-no">${icon('down')} Un autre mot</button><button class="button primary ${own.myVote === true ? 'chosen' : ''}" data-action="vote-yes">${icon('up')} On le garde</button></div><p class="input-hint">${own.votes} vote(s) · ${state.rules.rerolls - own.rerolls} reroll(s) restant(s)<br>${state.players.filter(p => p.team === state.players.find(p => p.id === state.me).team).length === 2 ? 'À deux joueurs dans l’équipe, le sage décide.' : 'Le choix se fait à la majorité absolue.'}</p><span class="tag">Décompte <strong id="vote-clock">00:00</strong></span></dialog>`;
}
function trapModal() {
  const sage = state.players.find(p => p.id === state.me).role === 'sage';
  return `<dialog id="claim-dialog" class="modal claim-modal"><div class="modal-symbol">${icon('alert')}</div><span class="card-kicker">LE TEMPS EST SUSPENDU</span><h2>Un mot de trop ?</h2><p>Le mot <strong>« ${esc(state.trapClaim.word)} »</strong> a été piégé par l’équipe adverse !</p><p>${sage ? 'Accepter fait perdre le passage au sage actif. Annuler reprend le décompte.' : 'Les deux sages peuvent accepter ou annuler ce signalement.'}</p>${sage ? '<div class="vote-buttons"><button class="button secondary" data-action="reject-claim">Annuler</button><button class="button danger" data-action="accept-claim">Accepter le piège</button></div>' : '<span class="tag">Décision des sages en attente</span>'}</dialog>`;
}
function winnerModal() {
  const draw = state.winner === 'draw';
  return `<dialog id="winner-dialog" class="modal winner-modal"><button class="modal-close icon-button" data-action="dismiss-winner" aria-label="Fermer le résultat">${icon('close')}</button><div class="winner-art ${state.winner}">${icon('crown')}</div><span class="card-kicker">${draw ? 'À ARMES ÉGALES' : 'LES MOTS ONT LEUR MAÎTRE'}</span><h2>${draw ? 'Match nul !' : `Félicitations à<br>l’équipe ${teamName(state.winner)} !`}</h2><p>Rouge ${state.scores.red} — ${state.scores.blue} Bleu<br>Une belle partie. Une revanche ?</p><button class="button primary full" data-action="dismiss-winner">${draw ? 'Bien joué, tout le monde' : 'Bien joué !'} ${icon('check')}</button></dialog>`;
}
function render() {
  const focused = document.activeElement, focusId = focused?.id, selection = focused?.selectionStart;
  const drafts = {}; for (const el of document.querySelectorAll('input, select')) if (el.id) drafts[el.id] = { value: el.value, checked: el.checked };
  app.innerHTML = location.hash === '#parametres' ? settingsPage() : state ? game() : home();
  if (help) app.insertAdjacentHTML('beforeend', helpModal());
  else if (state?.trapClaim) app.insertAdjacentHTML('beforeend', trapModal());
  else if (state?.phase === 'finished' && dismissedWinner !== `${state.code}:${state.round}`) app.insertAdjacentHTML('beforeend', winnerModal());
  else if (state?.phase === 'choice' && state.playing && state.own && !state.own.locked) app.insertAdjacentHTML('beforeend', voteModal());
  for (const [id, draft] of Object.entries(drafts)) { const el = document.getElementById(id); if (el && !el.disabled && !id.startsWith('setting-')) { el.value = draft.value; if (el.type === 'checkbox') el.checked = draft.checked; } }
  paintEntryStatus();
  const dialog = $('dialog'); if (dialog) { dialog.showModal(); dialog.addEventListener('cancel', event => { event.preventDefault(); if (help) { help = false; render(); } else if (dialog.id === 'winner-dialog') { dismissedWinner = `${state.code}:${state.round}`; render(); } }); }
  if (focusId) { const el = document.getElementById(focusId); if (el && !el.disabled && (!dialog || dialog.contains(el))) { el.focus({ preventScroll: true }); try { el.setSelectionRange(selection, selection); } catch { /* Select ou checkbox. */ } } }
}
async function act(type, data) { try { await room.action(type, data); return true; } catch (error) { toast(error.message); return false; } }
document.addEventListener('click', async event => {
  sound.unlock();
  const button = event.target.closest('[data-action]'); if (!button || button.disabled) return;
  const action = button.dataset.action;
  if (action === 'cancel-wake') { room.cancelEntry(); }
  else if (action === 'sound') { sound.toggle(); render(); }
  else if (action === 'help') { help = true; render(); }
  else if (action === 'close-help') { help = false; render(); }
  else if (action === 'rules' || action === 'settings') { settingsDraft = null; if (location.hash === '#parametres') render(); else location.hash = 'parametres'; }
  else if (action === 'settings-back') { location.hash = ''; }
  else if (action === 'settings-reset' && canEditSettings()) { settingsDraft = { ...defaultRules }; render(); }
  else if (action === 'dismiss-winner') { dismissedWinner = `${state.code}:${state.round}`; render(); }
  else if (action === 'copy') {
    const link = `${location.origin}/?salon=${state.code}`;
    try { await navigator.clipboard.writeText(link); toast('Lien d’invitation copié !'); }
    catch { toast(`Code du salon : ${state.code}`); }
  } else if (action === 'leave') { try { await room.leave(); } catch (error) { toast(error.message); } }
  else if (action === 'forget') room.forget();
  else if (action === 'seat') await act('seat', { team: button.dataset.team, role: button.dataset.role });
  else if (action.startsWith('vote-')) await act('vote', { accept: action === 'vote-yes', word: state.own.word });
  else if (action === 'removeTrap' || action === 'claim') await act(action, { id: button.dataset.id });
  else if (action.endsWith('-claim')) await act('resolveClaim', { accept: action === 'accept-claim' });
  else if (['play', 'pause', 'replay'].includes(action)) { if (action === 'replay') dismissedWinner = ''; await act(action); }
});
document.addEventListener('submit', async event => {
  event.preventDefault(); sound.unlock(); if (busy) return; busy = true;
  const form = event.target, data = new FormData(form), submitter = event.submitter;
  if (submitter) submitter.disabled = true;
  try {
    if (form.id === 'entry-form') {
      const joining = event.submitter?.value === 'join';
      const code = String(data.get('code')).trim().toUpperCase();
      if (joining && !/^[A-F0-9]{6}$/.test(code)) throw new Error('Saisissez les 6 caractères du code du salon.');
      entryMode = joining ? 'join' : 'create';
      await room.enter(String(data.get('nickname')), joining ? code : null, savedRules());
    } else if (form.id === 'word-form') {
      const input = $('#word-input'), word = String(data.get('word'));
      input.value = '';
      if (!await act(state.phase === 'traps' ? 'addTrap' : 'guess', { word })) { const current = $('#word-input'); if (current) current.value = word; }
      $('#word-input')?.focus();
    } else if (form.id === 'settings-form') {
      if (!canEditSettings()) throw new Error('Les paramètres sont en lecture seule.');
      const rules = readSettings(form);
      if (state) {
        if (!await act('rules', { rules })) return;
        toast('Les paramètres du salon ont été enregistrés.');
      } else {
        try { localStorage.setItem('kenshou.rules', JSON.stringify(rules)); }
        catch { throw new Error('Le navigateur ne permet pas de mémoriser les paramètres.'); }
        toast('Vos paramètres sont enregistrés pour les prochains salons.');
      }
      settingsDraft = { ...rules }; render();
    }
  } catch (error) { toast(error.message); }
  finally { busy = false; if (submitter?.isConnected) submitter.disabled = false; if (form.id === 'entry-form') paintEntryStatus(); }
});
window.addEventListener('hashchange', () => { settingsDraft = null; render(); window.scrollTo(0, 0); });
document.addEventListener('change', event => {
  const form = event.target.closest('#settings-form');
  if (!form || !canEditSettings()) return;
  settingsDraft = readSettings(form);
  const summary = $('#settings-summary-content'); if (summary) summary.innerHTML = settingsSummary(settingsDraft);
});
render(); room.resume();

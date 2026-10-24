import { randomBytes, randomInt, randomUUID } from 'node:crypto';

export const DEFAULT_RULES = Object.freeze({ choiceSeconds: 20, trapSeconds: 90, orationSeconds: 120, rerolls: 2, traps: 6, guesses: 5, targetScore: 3, noTiePoint: true, medium: true, hard: false });
export const OPTIONS = Object.freeze({ choiceSeconds: [10, 20, 30, 45, 60], trapSeconds: [30, 60, 90, 120, 180], orationSeconds: [30, 60, 90, 120, 180], rerolls: [0, 1, 2, 3, 4, 5], traps: [3, 4, 5, 6, 8, 10, 12], guesses: [3, 4, 5, 6, 8, 10], targetScore: [1, 3, 5, 7, 10] });
const other = team => team === 'red' ? 'blue' : 'red';
export const normalize = text => String(text).normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('fr').replace(/[’']/g, ' ').replace(/[-\s]+/g, ' ').trim();
const label = team => team === 'red' ? 'rouge' : 'bleue';
export class GameError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
function ensure(condition, message, status) { if (!condition) throw new GameError(message, status); }
function wordInput(value) {
  ensure(typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 40, 'Saisissez un mot de 1 à 40 caractères.');
  ensure(/^[\p{L}\p{M}\s’'-]+$/u.test(value.trim()), 'Utilisez uniquement des lettres, espaces, apostrophes ou tirets.');
  return value.trim().replace(/\s+/g, ' ');
}
export function validateRules(input) {
  ensure(input && typeof input === 'object' && !Array.isArray(input), 'Règles invalides.');
  const rules = { ...DEFAULT_RULES };
  for (const [key, values] of Object.entries(OPTIONS)) {
    if (Object.hasOwn(input, key)) { ensure(values.includes(input[key]), `Valeur non autorisée : ${key}.`); rules[key] = input[key]; }
  }
  for (const key of ['noTiePoint', 'medium', 'hard']) {
    if (Object.hasOwn(input, key)) { ensure(typeof input[key] === 'boolean', `Valeur non autorisée : ${key}.`); rules[key] = input[key]; }
  }
  return rules;
}

export class GameStore {
  constructor(dictionaries, { now = () => Date.now(), pick = values => values[randomInt(values.length)] } = {}) {
    this.rooms = new Map(); this.dictionaries = dictionaries; this.now = now; this.pick = pick;
  }
  create(name, rules) {
    ensure(this.rooms.size < 1000, 'Le serveur est complet. Réessayez plus tard.', 503);
    let code; do { code = randomBytes(4).toString('hex').slice(0, 6).toUpperCase(); } while (this.rooms.has(code));
    const room = { code, hostId: null, rules: validateRules(rules ?? {}), players: [], phase: 'lobby', playing: false, deadline: null, remaining: 0, round: 0, scores: { red: 0, blue: 0 }, teams: {}, results: {}, activeTeam: null, trapClaim: null, history: [], used: [], winner: null, updatedAt: this.now(), revision: 0 };
    this.rooms.set(code, room);
    try { return this.join(code, name); } catch (error) { this.rooms.delete(code); throw error; }
  }
  get(code) { const room = this.rooms.get(String(code).toUpperCase()); ensure(room, 'Ce salon est introuvable ou a expiré.', 404); return room; }
  join(code, name) {
    const room = this.get(code);
    ensure(room.phase === 'lobby', 'La partie a déjà commencé. Rejoignez le prochain salon.');
    ensure(typeof name === 'string' && name.trim().length >= 2 && name.trim().length <= 20, 'Le pseudo doit contenir entre 2 et 20 caractères.');
    ensure(!room.players.some(p => normalize(p.name) === normalize(name)), 'Ce pseudo est déjà utilisé dans ce salon.');
    ensure(room.players.length < 16, 'Le salon est complet (16 joueurs maximum).');
    const player = { id: randomUUID(), token: randomBytes(32).toString('hex'), name: name.trim(), team: null, role: 'disciple', connected: false };
    room.players.push(player); room.hostId ??= player.id; this.touch(room);
    return { room: room.code, token: player.token, playerId: player.id };
  }
  auth(room, token) { const player = room.players.find(p => p.token === token); ensure(player, 'Votre session n’est plus valide.', 401); return player; }
  touch(room) { room.updatedAt = this.now(); room.revision++; }
  log(room, text, kind = 'event') { room.history.push({ id: randomUUID(), text, kind, at: this.now() }); room.history = room.history.slice(-200); }
  controller(room, player) { ensure(player.id === room.hostId || player.role === 'sage', 'Seuls l’hôte et les sages pilotent la partie.', 403); }
  ready(room) {
    return ['red', 'blue'].every(team => room.players.filter(p => p.team === team && p.role === 'sage' && p.connected).length === 1 && room.players.some(p => p.team === team && p.role === 'disciple' && p.connected)) && room.players.every(p => p.connected && p.team);
  }
  connect(room, player, connected) {
    player.connected = connected;
    if (!connected && room.playing) { this.pause(room); this.log(room, `${player.name} s’est déconnecté. La partie est en pause.`); }
    if (!connected && player.id === room.hostId) { room.hostId = room.players.find(p => p.connected)?.id ?? player.id; }
    this.touch(room);
  }
  startTimer(room, seconds) { room.remaining = seconds * 1000; room.deadline = this.now() + room.remaining; room.playing = true; }
  pause(room) { room.remaining = Math.max(0, room.deadline - this.now()); room.deadline = null; room.playing = false; }
  nextWord(room, team) {
    const pool = [...this.dictionaries.easy, ...(room.rules.medium ? this.dictionaries.medium : []), ...(room.rules.hard ? this.dictionaries.hard : [])];
    let available = [...new Set(pool)].filter(word => !room.used.includes(normalize(word)));
    if (!available.length) { room.used = []; available = [...new Set(pool)]; }
    ensure(available.length, 'Les dictionnaires du serveur sont vides.', 503);
    const word = this.pick(available); room.used.push(normalize(word));
    room.teams[team].word = word; room.teams[team].votes = {};
  }
  startRound(room) {
    room.round++; room.results = {}; room.activeTeam = null; room.trapClaim = null;
    room.teams = { red: { word: '', rerolls: 0, locked: false, votes: {}, traps: [] }, blue: { word: '', rerolls: 0, locked: false, votes: {}, traps: [] } };
    this.nextWord(room, 'red'); this.nextWord(room, 'blue');
    for (const team of ['red', 'blue']) room.teams[team].locked = room.rules.rerolls === 0;
    room.phase = 'choice'; this.startTimer(room, room.rules.choiceSeconds);
    this.log(room, `Manche ${room.round} · Début de la première phase : choix du mot.`);
  }
  resolveVote(room, team) {
    const state = room.teams[team], members = room.players.filter(p => p.team === team);
    let result = null;
    if (members.length === 2) { const sage = members.find(p => p.role === 'sage'); result = state.votes[sage.id] ?? null; }
    else {
      const votes = Object.values(state.votes);
      if (votes.filter(v => v === true).length > members.length / 2) result = true;
      if (votes.filter(v => v === false).length > members.length / 2) result = false;
    }
    if (result === true) state.locked = true;
    if (result === false) { state.rerolls++; this.nextWord(room, team); if (state.rerolls >= room.rules.rerolls) state.locked = true; }
  }
  finishTurn(room, success, reason) {
    const team = room.activeTeam, word = room.teams[other(team)].word;
    room.results[team] = { success, reason, word };
    room.playing = false; room.deadline = null; room.remaining = 0; room.trapClaim = null;
    this.log(room, success ? `L’équipe ${label(team)} a trouvé « ${word} » !` : `Équipe ${label(team)} : dommage, il fallait trouver le mot « ${word} ». ${reason}`);
    if (team === 'red') { room.phase = 'readyBlue'; this.log(room, 'Mise en attente pour la troisième phase · Sage bleu.'); }
    else this.finishRound(room);
  }
  finishRound(room) {
    const red = room.results.red.success, blue = room.results.blue.success;
    const tied = room.rules.noTiePoint && red && blue;
    if (red && !tied) room.scores.red++;
    if (blue && !tied) room.scores.blue++;
    this.log(room, tied || (!red && !blue) ? 'Fin de la manche · Égalité, personne ne remporte de point.' : `Fin de la manche · Rouge +${red ? 1 : 0}, Bleu +${blue ? 1 : 0}.`);
    room.phase = 'roundEnd'; room.activeTeam = null;
    const winners = ['red', 'blue'].filter(team => room.scores[team] >= room.rules.targetScore);
    if (winners.length) { room.phase = 'finished'; room.winner = winners.length === 2 ? 'draw' : winners[0]; this.log(room, room.winner === 'draw' ? 'Bravo aux deux équipes · Match nul !' : `Bravo l’équipe ${label(room.winner)} !`); }
  }
  tickRoom(room) {
    if (!room.playing || this.now() < room.deadline) return false;
    if (room.phase === 'choice') {
      for (const team of ['red', 'blue']) room.teams[team].locked = true;
      room.phase = 'traps'; this.startTimer(room, room.rules.trapSeconds); this.log(room, 'Début de la deuxième phase : choix des mots piégés.');
    } else if (room.phase === 'traps') {
      room.phase = 'readyRed'; room.playing = false; room.deadline = null; room.remaining = 0;
      this.log(room, 'Mise en attente pour la troisième phase · Sage rouge.');
    } else if (room.phase === 'oration') this.finishTurn(room, false, 'Temps écoulé.');
    this.touch(room); return true;
  }
  action(room, player, type, data = {}) {
    this.tickRoom(room);
    ensure(data && typeof data === 'object' && !Array.isArray(data), 'Données d’action invalides.');
    if (type === 'seat') {
      ensure(room.phase === 'lobby', 'Les équipes sont verrouillées pendant la partie.');
      ensure(['red', 'blue'].includes(data.team) && ['sage', 'disciple'].includes(data.role), 'Place invalide.');
      ensure(data.role !== 'sage' || !room.players.some(p => p.id !== player.id && p.team === data.team && p.role === 'sage'), 'Cette équipe a déjà un sage.');
      player.team = data.team; player.role = data.role;
    } else if (type === 'rules') {
      ensure(room.hostId === player.id, 'Seul l’hôte peut modifier les règles.', 403); ensure(room.phase === 'lobby', 'Les règles sont verrouillées.');
      room.rules = validateRules(data.rules);
    } else if (type === 'play') {
      this.controller(room, player); ensure(!room.trapClaim, 'Réglez d’abord le mot piégé.'); ensure(!room.playing, 'Le décompte est déjà lancé.');
      ensure(this.ready(room), 'Il faut un sage et au moins un disciple connectés par équipe. Chaque joueur doit choisir son équipe.');
      if (room.phase === 'lobby') { this.log(room, 'Nouvelle partie démarrée ! GL HF'); this.startRound(room); }
      else if (room.phase === 'roundEnd') this.startRound(room);
      else if (['readyRed', 'readyBlue'].includes(room.phase)) {
        room.activeTeam = room.phase === 'readyRed' ? 'red' : 'blue'; room.phase = 'oration'; room.guesses = [];
        this.startTimer(room, room.rules.orationSeconds); this.log(room, `Le sage ${room.activeTeam === 'red' ? 'rouge' : 'bleu'} a commencé son oration.`);
      } else if (['choice', 'traps', 'oration'].includes(room.phase)) { room.deadline = this.now() + room.remaining; room.playing = true; this.log(room, 'Le décompte reprend.'); }
      else throw new GameError('Cliquez sur Rejouer pour préparer une nouvelle partie.');
    } else if (type === 'pause') {
      this.controller(room, player); ensure(room.playing, 'La partie est déjà en pause.'); this.pause(room); this.log(room, 'Le décompte est en pause.');
    } else if (type === 'vote') {
      ensure(room.phase === 'choice' && room.playing && player.team, 'Le vote est fermé.');
      const state = room.teams[player.team]; ensure(!state.locked, 'Votre mot est déjà validé.');
      ensure(typeof data.accept === 'boolean', 'Vote invalide.'); ensure(data.word === state.word, 'Le mot a changé. Votez pour le nouveau mot.');
      state.votes[player.id] = data.accept; this.resolveVote(room, player.team);
    } else if (type === 'addTrap') {
      ensure(room.phase === 'traps' && room.playing && player.team, 'La saisie des pièges est fermée.');
      const state = room.teams[player.team], word = wordInput(data.word);
      ensure(state.traps.length < room.rules.traps, 'Votre équipe a atteint la limite de mots piégés.');
      ensure(normalize(word) !== normalize(state.word), 'Le mot à deviner ne peut pas être un piège.');
      ensure(!state.traps.some(t => normalize(t.word) === normalize(word)), 'Ce mot est déjà piégé.');
      state.traps.push({ id: randomUUID(), word, author: player.name });
    } else if (type === 'removeTrap') {
      ensure(room.phase === 'traps' && room.playing && player.team, 'La modification des pièges est fermée.');
      room.teams[player.team].traps = room.teams[player.team].traps.filter(t => t.id !== data.id);
    } else if (type === 'guess') {
      ensure(room.phase === 'oration' && room.playing && player.team === room.activeTeam && player.role === 'disciple', 'Seuls les disciples de l’équipe en jeu peuvent proposer un mot.', 403);
      const word = wordInput(data.word);
      ensure(!room.guesses.some(g => normalize(g.word) === normalize(word)), 'Ce mot a déjà été proposé.');
      ensure(room.guesses.length < room.rules.guesses, 'La limite de propositions est atteinte.');
      room.guesses.push({ word, author: player.name }); this.log(room, `${player.name} · ${word}`, 'guess');
      if (normalize(word) === normalize(room.teams[other(player.team)].word)) this.finishTurn(room, true, 'Mot trouvé.');
      else if (room.guesses.length >= room.rules.guesses) this.finishTurn(room, false, 'Limite de propositions atteinte.');
    } else if (type === 'claim') {
      ensure(room.phase === 'oration' && room.playing && player.team === other(room.activeTeam), 'Seule l’équipe adverse peut signaler un piège.', 403);
      const trap = room.teams[player.team].traps.find(t => t.id === data.id); ensure(trap, 'Ce piège est introuvable.');
      this.pause(room); room.trapClaim = { word: trap.word, wasPlaying: true }; this.log(room, `Piège signalé : « ${trap.word} ». Décision des sages en attente.`);
    } else if (type === 'resolveClaim') {
      ensure(player.role === 'sage' && room.trapClaim, 'Seuls les sages peuvent décider du piège.', 403);
      ensure(typeof data.accept === 'boolean', 'Décision invalide.');
      if (data.accept) this.finishTurn(room, false, `Le mot « ${room.trapClaim.word} » était piégé.`);
      else { room.trapClaim = null; room.playing = this.ready(room); room.deadline = room.playing ? this.now() + room.remaining : null; this.log(room, room.playing ? 'Piège annulé par un sage. Le décompte reprend.' : 'Piège annulé. Reconnexion des joueurs attendue avant de reprendre.'); }
    } else if (type === 'replay') {
      this.controller(room, player); ensure(room.phase === 'finished', 'La partie doit être terminée pour rejouer.');
      room.phase = 'lobby'; room.scores = { red: 0, blue: 0 }; room.round = 0; room.teams = {}; room.results = {}; room.winner = null; room.activeTeam = null; room.history = []; room.used = []; room.remaining = 0;
      this.log(room, 'Nouvelle partie prête. Choisissez vos rôles et cliquez sur Jouer.');
    } else if (type === 'leave') {
      ensure(room.phase === 'lobby', 'Vous pourrez quitter le salon après la partie. Fermer cet onglet met le jeu en pause.');
      room.players = room.players.filter(p => p.id !== player.id);
      if (room.hostId === player.id) room.hostId = room.players.find(p => p.connected)?.id ?? room.players[0]?.id ?? null;
    } else throw new GameError('Action inconnue.');
    this.touch(room);
  }
  view(room, player) {
    const own = room.teams[player.team], target = room.teams[other(player.team)];
    // Aucune donnée de l’équipe adverse n’est envoyée avant sa révélation publique.
    const secret = room.phase === 'oration' && room.activeTeam === player.team && player.role === 'sage' ? target?.word : null;
    return { code: room.code, hostId: room.hostId, me: player.id, rules: room.rules, phase: room.phase, playing: room.playing, deadline: room.deadline, remaining: room.remaining, serverNow: this.now(), round: room.round, scores: room.scores, activeTeam: room.activeTeam, trapClaim: room.trapClaim ? { word: room.trapClaim.word } : null, results: room.results, winner: room.winner, revision: room.revision,
      players: room.players.map(({ token, ...safe }) => safe),
      own: own ? { word: own.word, locked: own.locked, rerolls: own.rerolls, traps: own.traps, votes: Object.keys(own.votes).length, myVote: own.votes[player.id] ?? null } : null,
      secret, guesses: room.phase === 'oration' ? room.guesses ?? [] : [], history: room.history, canStart: this.ready(room) };
  }
  cleanup() { for (const [code, room] of this.rooms) if (!room.players.some(p => p.connected) && this.now() - room.updatedAt > 2 * 60 * 60 * 1000) this.rooms.delete(code); }
}

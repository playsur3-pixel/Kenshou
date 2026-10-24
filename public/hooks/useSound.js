// Signaux originaux synthétisés, sans fichier sonore ni dépendance externe.
export function useSound() {
  let context, enabled = true;
  try { enabled = localStorage.getItem('kenshou.sound') !== 'off'; } catch { /* Valeur par défaut. */ }
  return {
    get enabled() { return enabled; },
    unlock() { try { context ??= new (window.AudioContext || window.webkitAudioContext)(); void context.resume(); } catch { /* Navigateur sans audio. */ } },
    toggle() { enabled = !enabled; try { localStorage.setItem('kenshou.sound', enabled ? 'on' : 'off'); } catch { /* Préférence en mémoire. */ } return enabled; },
    play(kind = 'phase') {
      if (!enabled || !context || context.state !== 'running') return;
      const notes = kind === 'win' ? [392, 494, 587, 784] : kind === 'round' ? [294, 392, 494] : [440, 587];
      notes.forEach((note, i) => { const osc = context.createOscillator(), gain = context.createGain(), at = context.currentTime + i * .13; osc.type = 'sine'; osc.frequency.value = note; gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(.09, at + .015); gain.gain.exponentialRampToValueAtTime(.001, at + .28); osc.connect(gain); gain.connect(context.destination); osc.start(at); osc.stop(at + .3); });
    }
  };
}

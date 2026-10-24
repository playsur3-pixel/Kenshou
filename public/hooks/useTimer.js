export function useTimer(readState, paint) {
  let offset = 0;
  const id = setInterval(() => {
    const state = readState(); if (!state) return;
    const ms = state.playing ? Math.max(0, state.deadline - (Date.now() + offset)) : state.remaining;
    paint(Math.ceil(ms / 1000), state);
  }, 100);
  return { sync(state) { offset = state.serverNow - Date.now(); }, destroy() { clearInterval(id); } };
}

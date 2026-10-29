let ctx;
const ac = () => (ctx ||= new (window.AudioContext || window.webkitAudioContext)());

function tone({ type = 'square', from, to, dur, vol = 0.15 }) {
  try {
    const c = ac();
    const t = c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(from, t);
    o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + dur);
  } catch { /* Audio nicht verfügbar */ }
}

export const sfx = {
  shoot: () => tone({ type: 'sawtooth', from: 900, to: 90, dur: 0.14, vol: 0.12 }),
  enemyShoot: () => tone({ type: 'sawtooth', from: 500, to: 70, dur: 0.14, vol: 0.06 }),
  hit: () => tone({ type: 'triangle', from: 1400, to: 900, dur: 0.08, vol: 0.18 }),
  hurt: () => tone({ type: 'square', from: 200, to: 60, dur: 0.25, vol: 0.2 }),
  kill: () => { tone({ type: 'triangle', from: 600, to: 1200, dur: 0.15 }); setTimeout(() => tone({ type: 'triangle', from: 900, to: 1800, dur: 0.2 }), 120); },
  die: () => tone({ type: 'sawtooth', from: 400, to: 40, dur: 0.6, vol: 0.2 }),
  win: () => [600, 800, 1000, 1300].forEach((f, i) => setTimeout(() => tone({ type: 'triangle', from: f, to: f * 1.01, dur: 0.25 }), i * 140)),
  lose: () => [500, 400, 300, 200].forEach((f, i) => setTimeout(() => tone({ type: 'triangle', from: f, to: f * 0.99, dur: 0.3 }), i * 180)),
};

export const unlockAudio = () => ac().resume?.();

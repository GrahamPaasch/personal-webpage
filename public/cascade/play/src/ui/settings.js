// Persisted settings with defaults (specs/05). Pure merge/validation + localStorage wrapper.
const KEY = 'cascade.settings.v1';

export const DEFAULT_KEYS = {
  left: ['ArrowLeft'], right: ['ArrowRight'], soft: ['ArrowDown'], hard: ['Space'],
  cw: ['ArrowUp', 'KeyX'], ccw: ['KeyZ', 'ControlLeft', 'ControlRight'], r180: ['KeyA'],
  hold: ['KeyC', 'ShiftLeft', 'ShiftRight'], pause: ['Escape', 'KeyP'],
};
export const ACTION_LABELS = {
  left: 'Move left', right: 'Move right', soft: 'Soft drop', hard: 'Hard drop', cw: 'Rotate ↻',
  ccw: 'Rotate ↺', r180: 'Rotate 180°', hold: 'Hold', pause: 'Pause',
};

export function defaults(reducedMotion = false) {
  return {
    das: 133, arr: 33, sdf: 20, music: 0.8, sfx: 0.8, muted: false, ghost: true,
    reduced: reducedMotion, shake: true, keys: structuredClone(DEFAULT_KEYS),
  };
}
const RANGES = { das: [50, 300], arr: [0, 100], sdf: [5, 40], music: [0, 1], sfx: [0, 1] };

export function sanitize(s, base) {
  const out = { ...base };
  for (const k of Object.keys(base)) {
    if (!(k in s)) continue;
    const v = s[k];
    if (k === 'keys') {
      out.keys = structuredClone(base.keys);
      if (v && typeof v === 'object') for (const a of Object.keys(base.keys)) if (Array.isArray(v[a]) && v[a].every(x => typeof x === 'string')) out.keys[a] = v[a].slice(0, 3);
    } else if (typeof base[k] === 'boolean') out[k] = !!v;
    else if (typeof base[k] === 'number' && Number.isFinite(Number(v))) {
      const [lo, hi] = RANGES[k] ?? [-Infinity, Infinity];
      out[k] = Math.min(hi, Math.max(lo, Number(v)));
    }
  }
  return out;
}
export function loadSettings(reducedMotion = false, storage = globalThis.localStorage) {
  const base = defaults(reducedMotion);
  try { return sanitize(JSON.parse(storage?.getItem(KEY) ?? '{}') ?? {}, base); } catch { return base; }
}
export function saveSettings(s, storage = globalThis.localStorage) { try { storage?.setItem(KEY, JSON.stringify(s)); } catch {} }

// Reverse lookup: KeyboardEvent.code → action.
export function keyMap(keys) {
  const m = new Map();
  for (const [action, codes] of Object.entries(keys)) for (const c of codes) m.set(c, action);
  return m;
}
// Bind `code` to `action` as its primary key, removing it from any other action.
export function rebind(keys, action, code) {
  const out = structuredClone(keys);
  for (const a of Object.keys(out)) out[a] = out[a].filter(c => c !== code);
  out[action] = [code, ...out[action].filter(c => c !== code)].slice(0, 3);
  return out;
}

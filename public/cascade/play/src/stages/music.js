// Music data for all six stages (pure data; see specs/02 + 04). Kept separate from the scene code so
// node tests can import it without touching the DOM.
// Part roles: pad | bass | drums | arp | lead. `threshold` = intensity at which the part fades in
// (0 = always on). `inst` names a synth in src/audio/instruments.js.

export const OCEAN = {
  key: 'D', scale: 'dorian', bpm: 72, swing: 0, reverb: { seconds: 5.5, decay: 2.2, wet: 0.5 },
  delay: { beats: 0.75, feedback: 0.42, wet: 0.22 },
  progression: ['Dm9', 'G6', 'Fmaj7', 'Cadd9', 'Dm9', 'G6', 'Am7', 'Cadd9'],
  parts: [
    { role: 'pad', inst: 'glassPad', threshold: 0, gain: 0.34, range: [53, 74], voices: 4 },
    { role: 'bass', inst: 'subBass', threshold: 0, gain: 0.5, style: 'sub', range: [33, 45] },
    { role: 'arp', inst: 'fmBell', threshold: 0.22, gain: 0.2, range: [69, 93], rate: 3, shape: 'motif', span: 6, rests: 0.4 },
    { role: 'drums', threshold: 0.4, gain: 0.5, patterns: { kick: 'X.........x.....', shaker: '..o...o-..o...o-', rim: '........o.......' }, layers: { rim: 0.6 }, fill: 'shaker', fillMin: 0.7 },
    { role: 'lead', inst: 'whale', threshold: 0.62, gain: 0.26, range: [62, 81] },
  ],
  sfx: { note: 'glassPluck', chord: 'fmBell', flourish: 'fmBell', impact: 'softThud' },
};

export const FOREST = {
  key: 'G', scale: 'major', melodyScale: 'majorPentatonic', bpm: 88, swing: 0.12,
  reverb: { seconds: 3.2, decay: 2.6, wet: 0.34 }, delay: { beats: 0.75, feedback: 0.3, wet: 0.14 },
  progression: ['Gadd9', 'Em7', 'Cadd9', 'Dsus4', 'Gadd9', 'Bm7', 'Cmaj7', 'D'],
  parts: [
    { role: 'pad', inst: 'warmPad', threshold: 0, gain: 0.26, range: [52, 72], voices: 4 },
    { role: 'bass', inst: 'woodBass', threshold: 0, gain: 0.5, style: 'pluck', range: [36, 50] },
    { role: 'arp', inst: 'marimba', threshold: 0.2, gain: 0.3, range: [62, 86], rate: 2, shape: 'motif', span: 6, rests: 0.3 },
    { role: 'drums', threshold: 0.38, gain: 0.55, patterns: { kick: 'X.......x.....x.', shaker: 'x-o-x-o-x-o-x-oo', woodblock: '....x.......x...', tom: '..........o.....' }, layers: { woodblock: 0.55, tom: 0.75 }, fill: 'woodblock', fillMin: 0.6 },
    { role: 'lead', inst: 'kalimba', threshold: 0.6, gain: 0.34, range: [67, 88] },
  ],
  sfx: { note: 'kalimba', chord: 'marimba', flourish: 'kalimba', impact: 'woodThud' },
};

export const DESERT = {
  key: 'E', scale: 'phrygianDominant', bpm: 96, swing: 0.08,
  reverb: { seconds: 2.6, decay: 2.0, wet: 0.3 }, delay: { beats: 0.5, feedback: 0.35, wet: 0.16 },
  progression: ['E', 'F', 'Dm', 'E', 'Am', 'Dm', 'F', 'E7'],
  parts: [
    { role: 'bass', inst: 'droneBass', threshold: 0, gain: 0.42, style: 'drone', range: [28, 43] },
    { role: 'pad', inst: 'stringPad', threshold: 0, gain: 0.2, range: [52, 71], voices: 3 },
    { role: 'drums', threshold: 0.2, gain: 0.62, patterns: { doum: 'X.......X.......', tek: '..x...x.....x...', riq: 'o.-.o.-.o.-.o.--' }, layers: { riq: 0.5 }, fill: 'tek', fillMin: 0.45 },
    { role: 'arp', inst: 'oud', threshold: 0.38, gain: 0.34, range: [59, 81], rate: 2, shape: 'motif', span: 5, rests: 0.35 },
    { role: 'lead', inst: 'ney', threshold: 0.64, gain: 0.3, range: [64, 84] },
  ],
  sfx: { note: 'oud', chord: 'oud', flourish: 'fmBell', impact: 'frameDrum' },
};

export const CITY = {
  key: 'A', scale: 'aeolian', bpm: 110, swing: 0,
  reverb: { seconds: 2.2, decay: 2.4, wet: 0.24 }, delay: { beats: 0.75, feedback: 0.38, wet: 0.2 },
  progression: ['Am9', 'Am9', 'Fmaj7', 'Fmaj7', 'Dm9', 'Em7', 'Fmaj7', 'G'],
  parts: [
    { role: 'pad', inst: 'sawPad', threshold: 0, gain: 0.2, range: [55, 76], voices: 4 },
    { role: 'bass', inst: 'sawBass', threshold: 0, gain: 0.4, style: 'synth', range: [33, 45] },
    { role: 'drums', threshold: 0.18, gain: 0.62, patterns: { kick: 'X...X...X...X...', hat: '..x...x...x...x.', clap: '....X.......X...', hat2: 'o-o-o-o-o-o-o-o-' }, layers: { clap: 0.35, hat2: 0.55 }, fill: 'clap', fillMin: 0.5 },
    { role: 'arp', inst: 'squareArp', threshold: 0.4, gain: 0.17, range: [64, 88], rate: 1, shape: 'motif', span: 7, gate: 0.6 },
    { role: 'lead', inst: 'neonLead', threshold: 0.7, gain: 0.2, range: [64, 84] },
  ],
  sfx: { note: 'squarePluck', chord: 'neonStab', flourish: 'squarePluck', impact: 'synthKick' },
};

export const AURORA = {
  key: 'F', scale: 'lydian', bpm: 100, swing: 0,
  reverb: { seconds: 6, decay: 2.0, wet: 0.5 }, delay: { beats: 0.75, feedback: 0.45, wet: 0.22 },
  progression: ['Fmaj7#11', 'G/F', 'Em7', 'Am7', 'Fmaj7#11', 'G/F', 'Dm7', 'Cmaj7'],
  parts: [
    { role: 'pad', inst: 'choirPad', threshold: 0, gain: 0.3, range: [53, 76], voices: 4 },
    { role: 'bass', inst: 'subBass', threshold: 0, gain: 0.42, style: 'walk', range: [29, 43] },
    { role: 'arp', inst: 'celesta', threshold: 0.25, gain: 0.24, range: [72, 96], rate: 2, shape: 'updown', span: 5 },
    { role: 'drums', threshold: 0.45, gain: 0.45, patterns: { kick: 'X.......X..x....', shaker: '..-o..-o..-o..-o', rim: '....x.......x...' }, layers: { rim: 0.6 }, fill: 'shaker', fillMin: 0.7 },
    { role: 'lead', inst: 'fmBell', threshold: 0.62, gain: 0.26, range: [69, 89] },
  ],
  sfx: { note: 'celesta', chord: 'fmBell', flourish: 'celesta', impact: 'iceThud' },
};

export const SPACE = {
  key: 'C', scale: 'aeolian', bpm: 120, swing: 0,
  reverb: { seconds: 7, decay: 1.8, wet: 0.48 }, delay: { beats: 0.75, feedback: 0.5, wet: 0.24 },
  progression: ['Cm9', 'Abmaj7', 'Ebmaj7', 'Bb6', 'Cm9', 'Abmaj7', 'Fm9', { chord: 'G7#5', scale: 'wholeTone', scaleRoot: 'G' }],
  parts: [
    { role: 'pad', inst: 'spacePad', threshold: 0, gain: 0.26, range: [51, 74], voices: 4 },
    { role: 'bass', inst: 'subBass', threshold: 0, gain: 0.46, style: 'pulse', range: [31, 43] },
    { role: 'arp', inst: 'resoArp', threshold: 0.22, gain: 0.17, range: [60, 91], rate: 1, shape: 'updown', span: 7, gate: 0.7 },
    { role: 'drums', threshold: 0.45, gain: 0.55, patterns: { kick: 'X.....x...X.....', hat: '..x...x...x...x.', snare: '....X.......X...', hat2: '-o-o-o-o-o-o-o-o' }, layers: { snare: 0.55, hat2: 0.7 }, fill: 'snare', fillMin: 0.6 },
    { role: 'lead', inst: 'spaceLead', threshold: 0.7, gain: 0.22, range: [65, 86] },
  ],
  sfx: { note: 'fmBell', chord: 'resoStab', flourish: 'fmBell', impact: 'subThud' },
};

export const TITLE_MUSIC = { ...OCEAN, bpm: 66, parts: OCEAN.parts.filter(p => p.role === 'pad' || p.role === 'bass' || p.role === 'arp') };

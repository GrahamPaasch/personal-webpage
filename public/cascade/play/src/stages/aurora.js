// Stage V: Aurora. Data-driven: music in ./music.js, scene + block skin in src/visual/scenes/aurora.js.
import { AURORA } from './music.js';
import { theme, drawBlock, createScene } from '../visual/scenes/aurora.js';

export default {
  id: 'aurora', name: 'Aurora', numeral: 'V', subtitle: 'the sky sings in colour',
  target: 20, levels: [8, 9],
  music: AURORA, theme, drawBlock, createScene,
};

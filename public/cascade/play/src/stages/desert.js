// Stage III: Desert. Data-driven: music in ./music.js, scene + block skin in src/visual/scenes/desert.js.
import { DESERT } from './music.js';
import { theme, drawBlock, createScene } from '../visual/scenes/desert.js';

export default {
  id: 'desert', name: 'Desert', numeral: 'III', subtitle: 'wind over the dunes',
  target: 16, levels: [5, 6],
  music: DESERT, theme, drawBlock, createScene,
};

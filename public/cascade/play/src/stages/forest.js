// Stage II: Forest. Data-driven: music in ./music.js, scene + block skin in src/visual/scenes/forest.js.
import { FOREST } from './music.js';
import { theme, drawBlock, createScene } from '../visual/scenes/forest.js';

export default {
  id: 'forest', name: 'Forest', numeral: 'II', subtitle: 'fireflies at dusk',
  target: 14, levels: [3, 4],
  music: FOREST, theme, drawBlock, createScene,
};

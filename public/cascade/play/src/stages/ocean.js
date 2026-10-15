// Stage I: Ocean. Data-driven: music in ./music.js, scene + block skin in src/visual/scenes/ocean.js.
import { OCEAN } from './music.js';
import { theme, drawBlock, createScene } from '../visual/scenes/ocean.js';

export default {
  id: 'ocean', name: 'Ocean', numeral: 'I', subtitle: 'the deep, breathing slowly',
  target: 12, levels: [1, 2],
  music: OCEAN, theme, drawBlock, createScene,
};

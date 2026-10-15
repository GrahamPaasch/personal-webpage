// Stage VI: Space. Data-driven: music in ./music.js, scene + block skin in src/visual/scenes/space.js.
import { SPACE } from './music.js';
import { theme, drawBlock, createScene } from '../visual/scenes/space.js';

export default {
  id: 'space', name: 'Space', numeral: 'VI', subtitle: 'beyond the last horizon',
  target: 24, levels: [10, 12],
  music: SPACE, theme, drawBlock, createScene,
};

// Stage IV: City at Night. Data-driven: music in ./music.js, scene + block skin in src/visual/scenes/city.js.
import { CITY } from './music.js';
import { theme, drawBlock, createScene } from '../visual/scenes/city.js';

export default {
  id: 'city', name: 'City at Night', numeral: 'IV', subtitle: 'neon, rain, and a pulse',
  target: 18, levels: [7, 8],
  music: CITY, theme, drawBlock, createScene,
};

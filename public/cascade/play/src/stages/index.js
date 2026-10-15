// The journey's stages, in order. Adding a stage = one module + one line here (see README).
import ocean from './ocean.js';
import forest from './forest.js';
import desert from './desert.js';
import city from './city.js';
import aurora from './aurora.js';
import space from './space.js';

export const STAGES = [ocean, forest, desert, city, aurora, space];
export const stageById = id => STAGES.find(s => s.id === id);

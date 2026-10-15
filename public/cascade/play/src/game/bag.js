import { PIECES } from './pieces.js';
import { mulberry32 } from './rng.js';

// Seeded 7-bag randomizer with a peekable queue.
export class Bag {
  constructor(seed = 1) {
    this.rand = mulberry32(seed);
    this.queue = [];
  }
  refill() {
    const bag = PIECES.slice();
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(this.rand() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    this.queue.push(...bag);
  }
  next() {
    while (this.queue.length < 8) this.refill();
    return this.queue.shift();
  }
  peek(n) {
    while (this.queue.length < n + 1) this.refill();
    return this.queue.slice(0, n);
  }
}

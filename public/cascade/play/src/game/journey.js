// Journey/endless progression: which stage we're in, stage progress, and the level (speed).
// Pure and DOM-free. `stages` = [{ target, levels: [from, to] }].

export class Journey {
  constructor(stages, { mode = 'journey', startStage = 0 } = {}) {
    this.stages = stages;
    this.mode = mode; // 'journey' | 'endless' | 'space'
    this.stageIndex = Math.min(startStage, stages.length - 1);
    this.stageLines = 0;
    this.totalLines = 0;
    this.spaceLines = 0; // lines since entering endless-in-space after the finale
    this.finished = false;
    this._level = this.computeLevel();
  }
  get stage() { return this.stages[this.stageIndex]; }
  get target() {
    if (this.mode === 'journey') return this.stage.target;
    if (this.mode === 'endless') return 20;
    return Infinity;
  }
  get progress() {
    if (this.mode === 'space') return Math.min(1, 0.6 + this.spaceLines / 100);
    return Math.min(1, this.stageLines / this.target);
  }
  get level() { return this._level; }

  computeLevel() {
    if (this.mode === 'journey') {
      const [a, b] = this.stage.levels;
      return Math.max(1, Math.floor(a + (b - a + 0.999) * Math.min(1, this.stageLines / this.stage.target)));
    }
    if (this.mode === 'endless') return 1 + Math.floor(this.totalLines / 10);
    const last = this.stages[this.stages.length - 1].levels[1];
    return last + Math.floor(this.spaceLines / 10);
  }

  // Returns { advanced: bool, finished: bool, from, to }.
  addLines(n) {
    const res = { advanced: false, finished: false, from: this.stageIndex, to: this.stageIndex };
    if (n <= 0 || this.finished) return res;
    this.totalLines += n;
    if (this.mode === 'space') {
      this.spaceLines += n;
    } else {
      this.stageLines += n;
      while (this.stageLines >= this.target && !this.finished) {
        if (this.mode === 'journey' && this.stageIndex === this.stages.length - 1) {
          this.finished = true;
          res.finished = true;
        } else {
          this.stageLines -= this.target;
          this.stageIndex = (this.stageIndex + 1) % this.stages.length;
          res.advanced = true;
          res.to = this.stageIndex;
          if (this.mode === 'journey') this.stageLines = 0; // leftover lines don't skip the next stage's bloom
        }
      }
    }
    const prev = this._level;
    // Level never decreases in journey mode.
    this._level = Math.max(this.mode === 'journey' ? prev : 1, this.computeLevel());
    return res;
  }

  continueInSpace() {
    this.mode = 'space';
    this.finished = false;
    this.stageIndex = this.stages.length - 1;
    this.spaceLines = 0;
    this._level = this.computeLevel();
  }
}

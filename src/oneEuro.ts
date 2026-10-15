// One Euro filter over a flat array of values (Casiez et al. 2012).
const alpha = (cutoff: number, dt: number) => {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
};

export class OneEuroArray {
  private x: Float32Array;
  private dx: Float32Array;
  private last = -1;
  constructor(size: number, private minCutoff: number, private beta: number, private dCutoff = 1) {
    this.x = new Float32Array(size);
    this.dx = new Float32Array(size);
  }
  reset() {
    this.last = -1;
  }
  /** Filters `v` into the returned internal buffer. `t` in seconds. */
  filter(v: ArrayLike<number>, t: number): Float32Array {
    if (this.last < 0) {
      for (let i = 0; i < this.x.length; i++) this.x[i] = v[i];
      this.dx.fill(0);
      this.last = t;
      return this.x;
    }
    const dt = Math.max(t - this.last, 1e-3);
    this.last = t;
    const ad = alpha(this.dCutoff, dt);
    for (let i = 0; i < this.x.length; i++) {
      const rawD = (v[i] - this.x[i]) / dt;
      this.dx[i] += ad * (rawD - this.dx[i]);
      const a = alpha(this.minCutoff + this.beta * Math.abs(this.dx[i]), dt);
      this.x[i] += a * (v[i] - this.x[i]);
    }
    return this.x;
  }
}

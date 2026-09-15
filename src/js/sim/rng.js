/**
 * Deterministic RNG shared with the C# and C++ reference implementations.
 *
 * xorshift32 plus Box-Muller, in exactly the arithmetic every language can
 * reproduce: 32-bit integer ops and a 24-bit mantissa for the uniform. Seeded
 * identically, all three implementations emit the same stream, which is what
 * `npm run crosscheck` verifies.
 */

// #region snippet:rng
export class Rng {
  constructor(seed = 1) {
    this.state = (seed >>> 0) || 0x9e3779b9;
    this.spare = null;
  }

  /** Raw 32-bit draw. */
  nextUint() {
    let x = this.state;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x >>> 0;
    return this.state;
  }

  /** Uniform on [0,1) from the top 24 bits, so every language agrees. */
  nextUnit() {
    return (this.nextUint() >>> 8) / 16777216;
  }

  /** Standard normal by Box-Muller, caching the second variate. */
  nextNormal() {
    if (this.spare !== null) {
      const s = this.spare;
      this.spare = null;
      return s;
    }
    const u1 = Math.max(this.nextUnit(), 1e-12);
    const u2 = this.nextUnit();
    const r = Math.sqrt(-2 * Math.log(u1));
    const theta = 2 * Math.PI * u2;
    this.spare = r * Math.sin(theta);
    return r * Math.cos(theta);
  }
}
// #endregion

/** Seeds the browser's interactive tools, where reproducibility is not wanted. */
export const randomSeed = () => (Math.random() * 0xffffffff) >>> 0;

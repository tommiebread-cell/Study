/**
 * Dense row-major matrices, sized for the instrument blocks in this vault
 * (tens of columns, never thousands). Mirrored by Matrix.cs and matrix.hpp.
 */

export class Matrix {
  constructor(rows, cols, data) {
    this.rows = rows;
    this.cols = cols;
    this.data = data || new Float64Array(rows * cols);
  }

  static zeros(rows, cols) {
    return new Matrix(rows, cols);
  }

  at(r, c) {
    return this.data[r * this.cols + c];
  }

  set(r, c, v) {
    this.data[r * this.cols + c] = v;
  }

  add(r, c, v) {
    this.data[r * this.cols + c] += v;
  }

  addInPlace(other) {
    const d = this.data, o = other.data;
    for (let i = 0; i < d.length; i++) d[i] += o[i];
    return this;
  }
}

/** C = A · B. */
export function multiply(a, b) {
  const out = Matrix.zeros(a.rows, b.cols);
  for (let i = 0; i < a.rows; i++) {
    for (let k = 0; k < a.cols; k++) {
      const aik = a.at(i, k);
      if (aik === 0) continue;
      for (let j = 0; j < b.cols; j++) out.add(i, j, aik * b.at(k, j));
    }
  }
  return out;
}

/** C = Aᵀ · B, without materialising Aᵀ. */
export function multiplyTransposed(a, b) {
  const out = Matrix.zeros(a.cols, b.cols);
  for (let k = 0; k < a.rows; k++) {
    for (let i = 0; i < a.cols; i++) {
      const aki = a.at(k, i);
      if (aki === 0) continue;
      for (let j = 0; j < b.cols; j++) out.add(i, j, aki * b.at(k, j));
    }
  }
  return out;
}

/**
 * Gauss-Jordan inverse with partial pivoting and a ridge on the diagonal.
 * Returns null when the matrix is numerically singular — which happens for
 * real once the instrument count outruns the sample, so callers must check.
 */
export function invert(source, ridge = 0) {
  const n = source.rows;
  const a = new Float64Array(n * 2 * n);
  const w = 2 * n;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) a[i * w + j] = source.at(i, j) + (i === j ? ridge : 0);
    a[i * w + n + i] = 1;
  }
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(a[r * w + col]) > Math.abs(a[pivot * w + col])) pivot = r;
    }
    if (Math.abs(a[pivot * w + col]) < 1e-12) return null;
    if (pivot !== col) {
      for (let j = 0; j < w; j++) {
        const t = a[pivot * w + j];
        a[pivot * w + j] = a[col * w + j];
        a[col * w + j] = t;
      }
    }
    const d = a[col * w + col];
    for (let j = 0; j < w; j++) a[col * w + j] /= d;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = a[r * w + col];
      if (f === 0) continue;
      for (let j = 0; j < w; j++) a[r * w + j] -= f * a[col * w + j];
    }
  }
  const out = Matrix.zeros(n, n);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) out.set(i, j, a[i * w + n + j]);
  return out;
}

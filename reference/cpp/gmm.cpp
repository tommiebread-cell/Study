#include "gmm.hpp"

#include <algorithm>
#include <cmath>
#include <limits>

namespace gmm {
namespace {

constexpr double kNaN = std::numeric_limits<double>::quiet_NaN();
constexpr double kPi = 3.14159265358979323846;

}  // namespace

double Rng::NextNormal() {
  if (has_spare_) {
    has_spare_ = false;
    return spare_;
  }
  const double u1 = std::max(NextUnit(), 1e-12);
  const double u2 = NextUnit();
  const double r = std::sqrt(-2.0 * std::log(u1));
  const double theta = 2.0 * kPi * u2;
  spare_ = r * std::sin(theta);
  has_spare_ = true;
  return r * std::cos(theta);
}

void Matrix::AddInPlace(const Matrix& other) {
  for (std::size_t i = 0; i < data_.size(); ++i) data_[i] += other.data_[i];
}

Matrix Multiply(const Matrix& a, const Matrix& b) {
  Matrix out(a.rows(), b.cols());
  for (int i = 0; i < a.rows(); ++i) {
    for (int k = 0; k < a.cols(); ++k) {
      const double aik = a.At(i, k);
      if (aik == 0.0) continue;
      for (int j = 0; j < b.cols(); ++j) out.Add(i, j, aik * b.At(k, j));
    }
  }
  return out;
}

Matrix MultiplyTransposed(const Matrix& a, const Matrix& b) {
  Matrix out(a.cols(), b.cols());
  for (int k = 0; k < a.rows(); ++k) {
    for (int i = 0; i < a.cols(); ++i) {
      const double aki = a.At(k, i);
      if (aki == 0.0) continue;
      for (int j = 0; j < b.cols(); ++j) out.Add(i, j, aki * b.At(k, j));
    }
  }
  return out;
}

// Gauss-Jordan with partial pivoting and a ridge. Returns false when the matrix
// is numerically singular, which is a real outcome once the instrument count
// outruns the sample.
bool Invert(const Matrix& source, double ridge, Matrix* out) {
  const int n = source.rows();
  const int w = 2 * n;
  std::vector<double> a(static_cast<std::size_t>(n) * w, 0.0);
  for (int i = 0; i < n; ++i) {
    for (int j = 0; j < n; ++j) a[static_cast<std::size_t>(i) * w + j] = source.At(i, j) + (i == j ? ridge : 0.0);
    a[static_cast<std::size_t>(i) * w + n + i] = 1.0;
  }
  for (int col = 0; col < n; ++col) {
    int pivot = col;
    for (int r = col + 1; r < n; ++r) {
      if (std::fabs(a[static_cast<std::size_t>(r) * w + col]) >
          std::fabs(a[static_cast<std::size_t>(pivot) * w + col])) {
        pivot = r;
      }
    }
    if (std::fabs(a[static_cast<std::size_t>(pivot) * w + col]) < 1e-12) return false;
    if (pivot != col) {
      for (int j = 0; j < w; ++j) {
        std::swap(a[static_cast<std::size_t>(pivot) * w + j], a[static_cast<std::size_t>(col) * w + j]);
      }
    }
    const double d = a[static_cast<std::size_t>(col) * w + col];
    for (int j = 0; j < w; ++j) a[static_cast<std::size_t>(col) * w + j] /= d;
    for (int r = 0; r < n; ++r) {
      if (r == col) continue;
      const double f = a[static_cast<std::size_t>(r) * w + col];
      if (f == 0.0) continue;
      for (int j = 0; j < w; ++j) {
        a[static_cast<std::size_t>(r) * w + j] -= f * a[static_cast<std::size_t>(col) * w + j];
      }
    }
  }
  Matrix inv(n, n);
  for (int i = 0; i < n; ++i) {
    for (int j = 0; j < n; ++j) inv.Set(i, j, a[static_cast<std::size_t>(i) * w + n + j]);
  }
  *out = inv;
  return true;
}

// #region snippet:dgp
// Draw an N x T panel from a known rho. Each unit starts at its own stationary
// mean, so the initial conditions satisfy the mean-stationarity restriction
// System GMM leans on; kBurnIn extra periods absorb any residual start effect.
Panel DrawPanel(int n, int t, double rho, double sigma_mu, Rng& rng) {
  Panel panel;
  panel.reserve(static_cast<std::size_t>(n));
  const double long_run = std::max(1.0 - rho, 1e-6);
  const double stationary_sd = std::sqrt(std::max(1.0 - rho * rho, 0.02));

  for (int i = 0; i < n; ++i) {
    const double mu = sigma_mu * rng.NextNormal();
    double y = mu / long_run + rng.NextNormal() / stationary_sd;
    for (int b = 0; b < kBurnIn; ++b) y = rho * y + mu + rng.NextNormal();

    std::vector<double> row(static_cast<std::size_t>(t));
    for (int k = 0; k < t; ++k) {
      y = rho * y + mu + rng.NextNormal();
      row[static_cast<std::size_t>(k)] = y;
    }
    panel.push_back(std::move(row));
  }
  return panel;
}
// #endregion

double PooledOls(const Panel& panel) {
  double sx = 0, sy = 0, sxx = 0, sxy = 0;
  long long n = 0;
  for (const auto& row : panel) {
    for (std::size_t t = 1; t < row.size(); ++t) {
      const double x = row[t - 1], y = row[t];
      sx += x; sy += y; sxx += x * x; sxy += x * y; ++n;
    }
  }
  if (n == 0) return kNaN;
  return (sxy - sx * sy / n) / (sxx - sx * sx / n);
}

double WithinFe(const Panel& panel) {
  double num = 0, den = 0;
  for (const auto& row : panel) {
    const std::size_t t = row.size();
    double mean_y = 0, mean_x = 0;
    for (std::size_t k = 1; k < t; ++k) { mean_y += row[k]; mean_x += row[k - 1]; }
    mean_y /= static_cast<double>(t - 1);
    mean_x /= static_cast<double>(t - 1);
    for (std::size_t k = 1; k < t; ++k) {
      num += (row[k - 1] - mean_x) * (row[k] - mean_y);
      den += (row[k - 1] - mean_x) * (row[k - 1] - mean_x);
    }
  }
  return den == 0.0 ? kNaN : num / den;
}

int DifferencedColumns(int t, bool collapse) {
  return collapse ? t - 2 : ((t - 1) * (t - 2)) / 2;
}

// #region snippet:core
// One-step GMM on the differenced equation, optionally stacked with the level
// equation (System GMM). `collapse` sums each moment condition across periods
// instead of keeping one column per period per lag.
static double Estimate(const Panel& panel, bool collapse, bool system) {
  const int t = static_cast<int>(panel[0].size());
  const int equations = t - 2;  // usable differenced periods, t = 3..T
  if (equations < 1) return kNaN;

  const int diff_cols = DifferencedColumns(t, collapse);
  const int level_cols = system ? (collapse ? 1 : equations) : 0;
  const int cols = diff_cols + level_cols;
  const int rows = system ? 2 * equations : equations;

  // Arellano-Bond weight: the MA(1) structure of du on the differenced block,
  // identity on the level block.
  Matrix h(rows, rows);
  for (int q = 0; q < equations; ++q) {
    h.Set(q, q, 2.0);
    if (q + 1 < equations) { h.Set(q, q + 1, -1.0); h.Set(q + 1, q, -1.0); }
  }
  for (int q = equations; q < rows; ++q) h.Set(q, q, 1.0);

  Matrix a(cols, cols), zr(cols, 1), zy(cols, 1);

  for (const auto& row : panel) {
    Matrix z(rows, cols), regressor(rows, 1), outcome(rows, 1);

    for (int q = 0; q < equations; ++q) {
      const int period = q + 3;  // 1-indexed t
      outcome.Set(q, 0, row[period - 1] - row[period - 2]);    // dy_it
      regressor.Set(q, 0, row[period - 2] - row[period - 3]);  // dy_i,t-1

      if (collapse) {
        // One column per lag order: column lag-2 holds y_i,t-lag.
        for (int lag = 2; lag <= t - 1; ++lag) {
          const int s = period - lag;
          if (s >= 1) z.Set(q, lag - 2, row[s - 1]);
        }
      } else {
        // One column per period per lag: y_i,1 .. y_i,t-2 for this equation.
        int base = 0;
        for (int p = 3; p < period; ++p) base += p - 2;
        for (int s = 1; s <= period - 2; ++s) z.Set(q, base + s - 1, row[s - 1]);
      }

      if (system) {
        const int lvl = equations + q;
        outcome.Set(lvl, 0, row[period - 1]);    // y_it
        regressor.Set(lvl, 0, row[period - 2]);  // y_i,t-1
        // Lagged difference instruments the level equation.
        z.Set(lvl, diff_cols + (collapse ? 0 : q), row[period - 2] - row[period - 3]);
      }
    }

    a.AddInPlace(MultiplyTransposed(z, Multiply(h, z)));
    zr.AddInPlace(MultiplyTransposed(z, regressor));
    zy.AddInPlace(MultiplyTransposed(z, outcome));
  }

  Matrix w(cols, cols);
  if (!Invert(a, 1e-8, &w)) return kNaN;
  const Matrix rzw = MultiplyTransposed(zr, w);  // (Z'R)' W
  const double denominator = Multiply(rzw, zr).At(0, 0);
  if (std::fabs(denominator) < 1e-10) return kNaN;
  return Multiply(rzw, zy).At(0, 0) / denominator;
}
// #endregion

double DifferenceGmm(const Panel& panel, bool collapse) { return Estimate(panel, collapse, false); }
double SystemGmm(const Panel& panel, bool collapse) { return Estimate(panel, collapse, true); }

Summary Summarise(const std::vector<double>& values) {
  double sum = 0;
  int n = 0;
  for (double v : values) {
    if (std::isfinite(v)) { sum += v; ++n; }
  }
  if (n == 0) return Summary{kNaN, kNaN, 0};
  const double mean = sum / n;
  double ss = 0;
  for (double v : values) {
    if (std::isfinite(v)) ss += (v - mean) * (v - mean);
  }
  return Summary{mean, std::sqrt(ss / n), n};
}

double Rmse(const std::vector<double>& values, double truth) {
  double ss = 0;
  int n = 0;
  for (double v : values) {
    if (std::isfinite(v)) { ss += (v - truth) * (v - truth); ++n; }
  }
  return n == 0 ? kNaN : std::sqrt(ss / n);
}

}  // namespace gmm

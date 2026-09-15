// Dynamic panel estimators for y_it = rho * y_i,t-1 + mu_i + u_it.
//
// A direct port of src/js/sim/gmm.js. The RNG and the order of arithmetic match
// the JavaScript and C# implementations, so the same seed produces the same
// estimates in all three. See tools/crosscheck.mjs.
//
// C++17, header + single translation unit, no dependencies.

#ifndef GMM_HPP
#define GMM_HPP

#include <cstdint>
#include <vector>

namespace gmm {

constexpr int kBurnIn = 20;

// #region snippet:rng
// xorshift32 plus Box-Muller. Deliberately 32-bit and 24-bit-mantissa so that
// JavaScript, C# and C++ walk the identical stream from the identical seed.
class Rng {
 public:
  explicit Rng(std::uint32_t seed = 1)
      : state_(seed != 0 ? seed : 0x9e3779b9u), has_spare_(false), spare_(0.0) {}

  std::uint32_t NextUint() {
    std::uint32_t x = state_;
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    state_ = x;
    return state_;
  }

  double NextUnit() { return static_cast<double>(NextUint() >> 8) / 16777216.0; }

  double NextNormal();

 private:
  std::uint32_t state_;
  bool has_spare_;
  double spare_;
};
// #endregion

// Row-major dense matrix. Sized for instrument blocks: tens of columns, never
// thousands, so the naive triple loop is the right call.
class Matrix {
 public:
  Matrix(int rows, int cols) : rows_(rows), cols_(cols), data_(static_cast<std::size_t>(rows) * cols, 0.0) {}

  double At(int r, int c) const { return data_[static_cast<std::size_t>(r) * cols_ + c]; }
  void Set(int r, int c, double v) { data_[static_cast<std::size_t>(r) * cols_ + c] = v; }
  void Add(int r, int c, double v) { data_[static_cast<std::size_t>(r) * cols_ + c] += v; }
  void AddInPlace(const Matrix& other);

  int rows() const { return rows_; }
  int cols() const { return cols_; }

 private:
  int rows_;
  int cols_;
  std::vector<double> data_;
};

Matrix Multiply(const Matrix& a, const Matrix& b);
Matrix MultiplyTransposed(const Matrix& a, const Matrix& b);  // A' * B
bool Invert(const Matrix& source, double ridge, Matrix* out);

using Panel = std::vector<std::vector<double>>;

Panel DrawPanel(int n, int t, double rho, double sigma_mu, Rng& rng);

double PooledOls(const Panel& panel);
double WithinFe(const Panel& panel);
double DifferenceGmm(const Panel& panel, bool collapse);
double SystemGmm(const Panel& panel, bool collapse);

int DifferencedColumns(int t, bool collapse);

struct Summary {
  double mean;
  double sd;
  int n;
};

Summary Summarise(const std::vector<double>& values);
double Rmse(const std::vector<double>& values, double truth);

}  // namespace gmm

#endif  // GMM_HPP

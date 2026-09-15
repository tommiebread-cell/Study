// Monte Carlo driver for the C++ reference implementation.
//
//   make && ./gmm --rho 0.9 --reps 200
//   ./gmm --json           # machine-readable, used by tools/crosscheck.mjs
//
// The JSON shape matches the Node and C# drivers exactly so the three can be
// diffed field by field.

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>

#include "gmm.hpp"

namespace {

struct Options {
  int n = 100;
  int t = 6;
  double rho = 0.6;
  double sigma_mu = 1.0;
  int reps = 200;
  std::uint32_t seed = 12345;
  bool collapse = true;
  bool json = false;
};

[[noreturn]] void Usage(int code) {
  std::fprintf(code == 0 ? stdout : stderr,
               "usage: gmm [--n N] [--t T] [--rho R] [--sigma-mu S] [--reps K]\n"
               "           [--seed S] [--uncollapsed] [--json]\n");
  std::exit(code);
}

bool NeedsValue(int i, int argc, const char* flag) {
  if (i + 1 >= argc) {
    std::fprintf(stderr, "gmm: %s needs a value\n", flag);
    return false;
  }
  return true;
}

Options Parse(int argc, char** argv) {
  Options o;
  for (int i = 1; i < argc; ++i) {
    const char* a = argv[i];
    auto take = [&](const char* flag) { if (!NeedsValue(i, argc, flag)) Usage(2); return argv[++i]; };
    if (!std::strcmp(a, "--n")) o.n = std::atoi(take("--n"));
    else if (!std::strcmp(a, "--t")) o.t = std::atoi(take("--t"));
    else if (!std::strcmp(a, "--rho")) o.rho = std::atof(take("--rho"));
    else if (!std::strcmp(a, "--sigma-mu")) o.sigma_mu = std::atof(take("--sigma-mu"));
    else if (!std::strcmp(a, "--reps")) o.reps = std::atoi(take("--reps"));
    else if (!std::strcmp(a, "--seed")) o.seed = static_cast<std::uint32_t>(std::strtoul(take("--seed"), nullptr, 10));
    else if (!std::strcmp(a, "--uncollapsed")) o.collapse = false;
    else if (!std::strcmp(a, "--json")) o.json = true;
    else if (!std::strcmp(a, "--help") || !std::strcmp(a, "-h")) Usage(0);
    else { std::fprintf(stderr, "gmm: unknown option %s\n", a); Usage(2); }
  }
  if (o.n < 2 || o.t < 4 || o.reps < 1) {
    std::fprintf(stderr, "gmm: need n >= 2, t >= 4, reps >= 1\n");
    Usage(2);
  }
  if (o.rho <= -1.0 || o.rho >= 1.0) {
    std::fprintf(stderr, "gmm: rho must lie strictly inside (-1, 1)\n");
    Usage(2);
  }
  return o;
}

void PrintSummaryJson(const char* name, const std::vector<double>& v, double rho, bool last) {
  const gmm::Summary s = gmm::Summarise(v);
  std::printf("  \"%s\": {\"mean\": %.17g, \"sd\": %.17g, \"rmse\": %.17g, \"n\": %d}%s\n",
              name, s.mean, s.sd, gmm::Rmse(v, rho), s.n, last ? "" : ",");
}

void PrintSummaryRow(const char* name, const std::vector<double>& v, double rho) {
  const gmm::Summary s = gmm::Summarise(v);
  std::printf("  %-16s %8.3f %+8.3f %8.3f %8.3f\n", name, s.mean, s.mean - rho, s.sd, gmm::Rmse(v, rho));
}

}  // namespace

int main(int argc, char** argv) {
  const Options o = Parse(argc, argv);

  gmm::Rng rng(o.seed);
  std::vector<double> ols, fe, diff, sys;
  ols.reserve(o.reps); fe.reserve(o.reps); diff.reserve(o.reps); sys.reserve(o.reps);
  int bracket = 0;
  double first[4] = {0, 0, 0, 0};

  for (int k = 0; k < o.reps; ++k) {
    const gmm::Panel panel = gmm::DrawPanel(o.n, o.t, o.rho, o.sigma_mu, rng);
    const double o_hat = gmm::PooledOls(panel);
    const double f_hat = gmm::WithinFe(panel);
    const double d_hat = gmm::DifferenceGmm(panel, o.collapse);
    const double s_hat = gmm::SystemGmm(panel, o.collapse);
    if (k == 0) { first[0] = o_hat; first[1] = f_hat; first[2] = d_hat; first[3] = s_hat; }
    ols.push_back(o_hat); fe.push_back(f_hat); diff.push_back(d_hat); sys.push_back(s_hat);
    if (f_hat < d_hat && d_hat < o_hat) ++bracket;
  }

  if (o.json) {
    std::printf("{\n");
    std::printf("  \"impl\": \"cpp\",\n");
    std::printf("  \"n\": %d, \"t\": %d, \"rho\": %.17g, \"sigmaMu\": %.17g,\n", o.n, o.t, o.rho, o.sigma_mu);
    std::printf("  \"reps\": %d, \"seed\": %u, \"collapse\": %s,\n",
                o.reps, o.seed, o.collapse ? "true" : "false");
    std::printf("  \"first\": {\"ols\": %.17g, \"fe\": %.17g, \"diff\": %.17g, \"sys\": %.17g},\n",
                first[0], first[1], first[2], first[3]);
    PrintSummaryJson("ols", ols, o.rho, false);
    PrintSummaryJson("fe", fe, o.rho, false);
    PrintSummaryJson("diff", diff, o.rho, false);
    PrintSummaryJson("sys", sys, o.rho, false);
    std::printf("  \"bracket\": %.17g\n", static_cast<double>(bracket) / o.reps);
    std::printf("}\n");
    return 0;
  }

  std::printf("N = %d, T = %d, rho = %.2f, sd(mu) = %.2f, %d reps, seed %u, %s instruments\n\n",
              o.n, o.t, o.rho, o.sigma_mu, o.reps, o.seed, o.collapse ? "collapsed" : "uncollapsed");
  std::printf("  %-16s %8s %8s %8s %8s\n", "estimator", "mean", "bias", "sd", "rmse");
  PrintSummaryRow("pooled OLS", ols, o.rho);
  PrintSummaryRow("fixed effects", fe, o.rho);
  PrintSummaryRow("difference GMM", diff, o.rho);
  PrintSummaryRow("system GMM", sys, o.rho);
  std::printf("\n  Nickell approximation for FE: %.3f\n", o.rho - (1.0 + o.rho) / (o.t - 1));
  std::printf("  Sanity bracket held in %.0f%% of draws\n", 100.0 * bracket / o.reps);
  return 0;
}

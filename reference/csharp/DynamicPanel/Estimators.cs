namespace DynamicPanel;

/// <summary>Mean, standard deviation and count over the finite entries only.</summary>
public readonly record struct Summary(double Mean, double Sd, int N);

/// <summary>Every estimator applied to one draw, so they are comparable.</summary>
public readonly record struct Replication(double Ols, double Fe, double Diff, double Sys);

/// <summary>
/// Dynamic panel estimators for y_it = rho * y_i,t-1 + mu_i + u_it.
/// A port of src/js/sim/gmm.js; the arithmetic order matches so the same seed
/// yields the same estimates in JavaScript, C# and C++.
/// </summary>
public static class Estimators
{
    private const int BurnIn = 20;

    // #region snippet:dgp
    /// <summary>
    /// Draw an N x T panel from a known rho. Each unit starts at its own
    /// stationary mean, so the initial conditions satisfy the mean-stationarity
    /// restriction System GMM leans on; BurnIn extra periods absorb any
    /// residual start effect.
    /// </summary>
    public static double[][] DrawPanel(int n, int t, double rho, double sigmaMu, Rng rng)
    {
        var panel = new double[n][];
        double longRun = Math.Max(1.0 - rho, 1e-6);
        double stationarySd = Math.Sqrt(Math.Max(1.0 - (rho * rho), 0.02));

        for (int i = 0; i < n; i++)
        {
            double mu = sigmaMu * rng.NextNormal();
            double y = (mu / longRun) + (rng.NextNormal() / stationarySd);

            for (int b = 0; b < BurnIn; b++)
            {
                y = (rho * y) + mu + rng.NextNormal();
            }

            var row = new double[t];
            for (int k = 0; k < t; k++)
            {
                y = (rho * y) + mu + rng.NextNormal();
                row[k] = y;
            }

            panel[i] = row;
        }

        return panel;
    }
    // #endregion

    /// <summary>Pooled OLS: biased upward, it reads mu_i as persistence.</summary>
    public static double PooledOls(double[][] panel)
    {
        double sx = 0, sy = 0, sxx = 0, sxy = 0;
        long n = 0;

        foreach (double[] row in panel)
        {
            for (int t = 1; t < row.Length; t++)
            {
                double x = row[t - 1];
                double y = row[t];
                sx += x;
                sy += y;
                sxx += x * x;
                sxy += x * y;
                n++;
            }
        }

        return n == 0 ? double.NaN : (sxy - (sx * sy / n)) / (sxx - (sx * sx / n));
    }

    /// <summary>Within-group: biased downward by roughly -(1+rho)/(T-1).</summary>
    public static double WithinFe(double[][] panel)
    {
        double num = 0, den = 0;

        foreach (double[] row in panel)
        {
            int t = row.Length;
            double meanY = 0, meanX = 0;
            for (int k = 1; k < t; k++)
            {
                meanY += row[k];
                meanX += row[k - 1];
            }

            meanY /= t - 1;
            meanX /= t - 1;

            for (int k = 1; k < t; k++)
            {
                num += (row[k - 1] - meanX) * (row[k] - meanY);
                den += (row[k - 1] - meanX) * (row[k - 1] - meanX);
            }
        }

        return den == 0.0 ? double.NaN : num / den;
    }

    /// <summary>Instrument columns in the differenced block, before any level equation.</summary>
    public static int DifferencedColumns(int t, bool collapse) =>
        collapse ? t - 2 : (t - 1) * (t - 2) / 2;

    // #region snippet:core
    /// <summary>
    /// One-step GMM on the differenced equation, optionally stacked with the
    /// level equation (System GMM). <paramref name="collapse"/> sums each moment
    /// condition across periods instead of keeping one column per period per lag.
    /// </summary>
    private static double Estimate(double[][] panel, bool collapse, bool system)
    {
        int t = panel[0].Length;
        int equations = t - 2;              // usable differenced periods, t = 3..T
        if (equations < 1)
        {
            return double.NaN;
        }

        int diffCols = DifferencedColumns(t, collapse);
        int levelCols = system ? (collapse ? 1 : equations) : 0;
        int cols = diffCols + levelCols;
        int rows = system ? 2 * equations : equations;

        // Arellano-Bond weight: the MA(1) structure of du on the differenced
        // block, identity on the level block.
        var h = new Matrix(rows, rows);
        for (int q = 0; q < equations; q++)
        {
            h[q, q] = 2.0;
            if (q + 1 < equations)
            {
                h[q, q + 1] = -1.0;
                h[q + 1, q] = -1.0;
            }
        }

        for (int q = equations; q < rows; q++)
        {
            h[q, q] = 1.0;
        }

        var a = new Matrix(cols, cols);
        var zr = new Matrix(cols, 1);
        var zy = new Matrix(cols, 1);

        foreach (double[] row in panel)
        {
            var z = new Matrix(rows, cols);
            var regressor = new Matrix(rows, 1);
            var outcome = new Matrix(rows, 1);

            for (int q = 0; q < equations; q++)
            {
                int period = q + 3;                                    // 1-indexed t
                outcome[q, 0] = row[period - 1] - row[period - 2];      // dy_it
                regressor[q, 0] = row[period - 2] - row[period - 3];    // dy_i,t-1

                if (collapse)
                {
                    // One column per lag order: column lag-2 holds y_i,t-lag.
                    for (int lag = 2; lag <= t - 1; lag++)
                    {
                        int s = period - lag;
                        if (s >= 1)
                        {
                            z[q, lag - 2] = row[s - 1];
                        }
                    }
                }
                else
                {
                    // One column per period per lag: y_i,1 .. y_i,t-2 here.
                    int baseCol = 0;
                    for (int p = 3; p < period; p++)
                    {
                        baseCol += p - 2;
                    }

                    for (int s = 1; s <= period - 2; s++)
                    {
                        z[q, baseCol + s - 1] = row[s - 1];
                    }
                }

                if (system)
                {
                    int lvl = equations + q;
                    outcome[lvl, 0] = row[period - 1];      // y_it
                    regressor[lvl, 0] = row[period - 2];    // y_i,t-1

                    // Lagged difference instruments the level equation.
                    z[lvl, diffCols + (collapse ? 0 : q)] = row[period - 2] - row[period - 3];
                }
            }

            a.AddInPlace(Matrix.MultiplyTransposed(z, Matrix.Multiply(h, z)));
            zr.AddInPlace(Matrix.MultiplyTransposed(z, regressor));
            zy.AddInPlace(Matrix.MultiplyTransposed(z, outcome));
        }

        Matrix? w = Matrix.Invert(a, 1e-8);
        if (w is null)
        {
            return double.NaN;
        }

        Matrix rzw = Matrix.MultiplyTransposed(zr, w);      // (Z'R)' W
        double denominator = Matrix.Multiply(rzw, zr)[0, 0];
        return Math.Abs(denominator) < 1e-10
            ? double.NaN
            : Matrix.Multiply(rzw, zy)[0, 0] / denominator;
    }
    // #endregion

    public static double DifferenceGmm(double[][] panel, bool collapse = true) =>
        Estimate(panel, collapse, system: false);

    public static double SystemGmm(double[][] panel, bool collapse = true) =>
        Estimate(panel, collapse, system: true);

    /// <summary>
    /// |corr(y_i,t-2, dy_i,t-1)| — the first stage the differenced moments run
    /// through, and what collapses as rho approaches one.
    /// </summary>
    public static double FirstStageCorrelation(double rho, int n, int t, int replications, Rng rng)
    {
        double sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
        long count = 0;

        for (int k = 0; k < replications; k++)
        {
            double[][] panel = DrawPanel(n, t, rho, 1.0, rng);
            foreach (double[] row in panel)
            {
                for (int period = 3; period <= t; period++)
                {
                    double x = row[period - 3];
                    double y = row[period - 2] - row[period - 3];
                    sx += x;
                    sy += y;
                    sxx += x * x;
                    syy += y * y;
                    sxy += x * y;
                    count++;
                }
            }
        }

        if (count == 0)
        {
            return double.NaN;
        }

        double vx = sxx - (sx * sx / count);
        double vy = syy - (sy * sy / count);
        return (sxy - (sx * sy / count)) / Math.Sqrt(Math.Max(vx * vy, 1e-12));
    }

    /// <summary>One replication: every estimator on the same draw.</summary>
    public static Replication Replicate(int n, int t, double rho, double sigmaMu, bool collapse, Rng rng)
    {
        double[][] panel = DrawPanel(n, t, rho, sigmaMu, rng);
        return new Replication(
            PooledOls(panel),
            WithinFe(panel),
            DifferenceGmm(panel, collapse),
            SystemGmm(panel, collapse));
    }

    public static Summary Summarise(IReadOnlyList<double> values)
    {
        double sum = 0;
        int n = 0;

        foreach (double v in values)
        {
            if (double.IsFinite(v))
            {
                sum += v;
                n++;
            }
        }

        if (n == 0)
        {
            return new Summary(double.NaN, double.NaN, 0);
        }

        double mean = sum / n;
        double ss = 0;
        foreach (double v in values)
        {
            if (double.IsFinite(v))
            {
                ss += (v - mean) * (v - mean);
            }
        }

        return new Summary(mean, Math.Sqrt(ss / n), n);
    }

    public static double Rmse(IReadOnlyList<double> values, double truth)
    {
        double ss = 0;
        int n = 0;

        foreach (double v in values)
        {
            if (double.IsFinite(v))
            {
                ss += (v - truth) * (v - truth);
                n++;
            }
        }

        return n == 0 ? double.NaN : Math.Sqrt(ss / n);
    }
}

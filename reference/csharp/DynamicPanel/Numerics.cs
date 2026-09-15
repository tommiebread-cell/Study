namespace DynamicPanel;

/// <summary>
/// xorshift32 plus Box-Muller. Deliberately 32-bit, with a 24-bit mantissa for
/// the uniform, so that JavaScript, C# and C++ walk the identical stream from
/// the identical seed. See tools/crosscheck.mjs.
/// </summary>
// #region snippet:rng
public sealed class Rng
{
    private uint _state;
    private double _spare;
    private bool _hasSpare;

    public Rng(uint seed = 1) => _state = seed != 0 ? seed : 0x9E3779B9u;

    /// <summary>Raw 32-bit draw.</summary>
    public uint NextUint()
    {
        uint x = _state;
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        _state = x;
        return _state;
    }

    /// <summary>Uniform on [0,1) from the top 24 bits.</summary>
    public double NextUnit() => (NextUint() >> 8) / 16777216.0;

    /// <summary>Standard normal by Box-Muller, caching the second variate.</summary>
    public double NextNormal()
    {
        if (_hasSpare)
        {
            _hasSpare = false;
            return _spare;
        }

        double u1 = Math.Max(NextUnit(), 1e-12);
        double u2 = NextUnit();
        double r = Math.Sqrt(-2.0 * Math.Log(u1));
        double theta = 2.0 * Math.PI * u2;

        _spare = r * Math.Sin(theta);
        _hasSpare = true;
        return r * Math.Cos(theta);
    }
}
// #endregion

/// <summary>
/// Row-major dense matrix, sized for instrument blocks: tens of columns, never
/// thousands, so the naive triple loop is the right call.
/// </summary>
public sealed class Matrix
{
    private readonly double[] _data;

    public Matrix(int rows, int cols)
    {
        Rows = rows;
        Cols = cols;
        _data = new double[rows * cols];
    }

    public int Rows { get; }

    public int Cols { get; }

    public double this[int r, int c]
    {
        get => _data[(r * Cols) + c];
        set => _data[(r * Cols) + c] = value;
    }

    public void Add(int r, int c, double v) => _data[(r * Cols) + c] += v;

    public void AddInPlace(Matrix other)
    {
        for (int i = 0; i < _data.Length; i++)
        {
            _data[i] += other._data[i];
        }
    }

    /// <summary>C = A · B.</summary>
    public static Matrix Multiply(Matrix a, Matrix b)
    {
        var outMatrix = new Matrix(a.Rows, b.Cols);
        for (int i = 0; i < a.Rows; i++)
        {
            for (int k = 0; k < a.Cols; k++)
            {
                double aik = a[i, k];
                if (aik == 0.0)
                {
                    continue;
                }

                for (int j = 0; j < b.Cols; j++)
                {
                    outMatrix.Add(i, j, aik * b[k, j]);
                }
            }
        }

        return outMatrix;
    }

    /// <summary>C = Aᵀ · B, without materialising the transpose.</summary>
    public static Matrix MultiplyTransposed(Matrix a, Matrix b)
    {
        var outMatrix = new Matrix(a.Cols, b.Cols);
        for (int k = 0; k < a.Rows; k++)
        {
            for (int i = 0; i < a.Cols; i++)
            {
                double aki = a[k, i];
                if (aki == 0.0)
                {
                    continue;
                }

                for (int j = 0; j < b.Cols; j++)
                {
                    outMatrix.Add(i, j, aki * b[k, j]);
                }
            }
        }

        return outMatrix;
    }

    /// <summary>
    /// Gauss-Jordan inverse with partial pivoting and a ridge on the diagonal.
    /// Returns null when the matrix is numerically singular, which is a real
    /// outcome once the instrument count outruns the sample.
    /// </summary>
    public static Matrix? Invert(Matrix source, double ridge)
    {
        int n = source.Rows;
        int w = 2 * n;
        double[] a = new double[n * w];

        for (int i = 0; i < n; i++)
        {
            for (int j = 0; j < n; j++)
            {
                a[(i * w) + j] = source[i, j] + (i == j ? ridge : 0.0);
            }

            a[(i * w) + n + i] = 1.0;
        }

        for (int col = 0; col < n; col++)
        {
            int pivot = col;
            for (int r = col + 1; r < n; r++)
            {
                if (Math.Abs(a[(r * w) + col]) > Math.Abs(a[(pivot * w) + col]))
                {
                    pivot = r;
                }
            }

            if (Math.Abs(a[(pivot * w) + col]) < 1e-12)
            {
                return null;
            }

            if (pivot != col)
            {
                for (int j = 0; j < w; j++)
                {
                    (a[(col * w) + j], a[(pivot * w) + j]) = (a[(pivot * w) + j], a[(col * w) + j]);
                }
            }

            double d = a[(col * w) + col];
            for (int j = 0; j < w; j++)
            {
                a[(col * w) + j] /= d;
            }

            for (int r = 0; r < n; r++)
            {
                if (r == col)
                {
                    continue;
                }

                double f = a[(r * w) + col];
                if (f == 0.0)
                {
                    continue;
                }

                for (int j = 0; j < w; j++)
                {
                    a[(r * w) + j] -= f * a[(col * w) + j];
                }
            }
        }

        var inverse = new Matrix(n, n);
        for (int i = 0; i < n; i++)
        {
            for (int j = 0; j < n; j++)
            {
                inverse[i, j] = a[(i * w) + n + j];
            }
        }

        return inverse;
    }
}

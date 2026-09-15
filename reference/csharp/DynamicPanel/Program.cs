using System.Globalization;

namespace DynamicPanel;

/// <summary>
/// Monte Carlo driver for the C# reference implementation.
///
///   dotnet run -- --rho 0.9 --reps 200
///   dotnet run -- --json           # machine-readable, for tools/crosscheck.mjs
///
/// The JSON shape matches the Node and C++ drivers exactly, so the three can be
/// diffed field by field.
/// </summary>
public static class Program
{
    private sealed record Options(
        int N, int T, double Rho, double SigmaMu, int Reps, uint Seed, bool Collapse, bool Json);

    public static int Main(string[] args)
    {
        Options options;
        try
        {
            options = Parse(args);
        }
        catch (ArgumentException ex)
        {
            Console.Error.WriteLine($"gmm: {ex.Message}");
            Usage(Console.Error);
            return 2;
        }

        var rng = new Rng(options.Seed);
        var ols = new List<double>(options.Reps);
        var fe = new List<double>(options.Reps);
        var diff = new List<double>(options.Reps);
        var sys = new List<double>(options.Reps);

        int bracket = 0;
        Replication first = default;

        for (int k = 0; k < options.Reps; k++)
        {
            Replication r = Estimators.Replicate(
                options.N, options.T, options.Rho, options.SigmaMu, options.Collapse, rng);

            if (k == 0)
            {
                first = r;
            }

            ols.Add(r.Ols);
            fe.Add(r.Fe);
            diff.Add(r.Diff);
            sys.Add(r.Sys);

            if (r.Fe < r.Diff && r.Diff < r.Ols)
            {
                bracket++;
            }
        }

        if (options.Json)
        {
            WriteJson(options, first, ols, fe, diff, sys, bracket);
        }
        else
        {
            WriteTable(options, ols, fe, diff, sys, bracket);
        }

        return 0;
    }

    private static Options Parse(string[] args)
    {
        int n = 100, t = 6, reps = 200;
        double rho = 0.6, sigmaMu = 1.0;
        uint seed = 12345;
        bool collapse = true, json = false;

        string Value(ref int index)
        {
            if (index + 1 >= args.Length)
            {
                throw new ArgumentException($"{args[index]} needs a value");
            }

            return args[++index];
        }

        for (int i = 0; i < args.Length; i++)
        {
            switch (args[i])
            {
                case "--n": n = int.Parse(Value(ref i), CultureInfo.InvariantCulture); break;
                case "--t": t = int.Parse(Value(ref i), CultureInfo.InvariantCulture); break;
                case "--rho": rho = double.Parse(Value(ref i), CultureInfo.InvariantCulture); break;
                case "--sigma-mu": sigmaMu = double.Parse(Value(ref i), CultureInfo.InvariantCulture); break;
                case "--reps": reps = int.Parse(Value(ref i), CultureInfo.InvariantCulture); break;
                case "--seed": seed = uint.Parse(Value(ref i), CultureInfo.InvariantCulture); break;
                case "--uncollapsed": collapse = false; break;
                case "--json": json = true; break;
                case "--help" or "-h": Usage(Console.Out); Environment.Exit(0); break;
                default: throw new ArgumentException($"unknown option {args[i]}");
            }
        }

        if (n < 2 || t < 4 || reps < 1)
        {
            throw new ArgumentException("need n >= 2, t >= 4, reps >= 1");
        }

        if (rho is <= -1.0 or >= 1.0)
        {
            throw new ArgumentException("rho must lie strictly inside (-1, 1)");
        }

        return new Options(n, t, rho, sigmaMu, reps, seed, collapse, json);
    }

    private static void Usage(TextWriter w) =>
        w.WriteLine(
            "usage: dotnet run -- [--n N] [--t T] [--rho R] [--sigma-mu S] [--reps K]\n" +
            "                     [--seed S] [--uncollapsed] [--json]");

    private static string G17(double v) => v.ToString("G17", CultureInfo.InvariantCulture);

    private static void WriteJson(
        Options o, Replication first,
        List<double> ols, List<double> fe, List<double> diff, List<double> sys, int bracket)
    {
        string Block(string name, List<double> v)
        {
            Summary s = Estimators.Summarise(v);
            return $"  \"{name}\": {{\"mean\": {G17(s.Mean)}, \"sd\": {G17(s.Sd)}, " +
                   $"\"rmse\": {G17(Estimators.Rmse(v, o.Rho))}, \"n\": {s.N}}},";
        }

        Console.WriteLine("{");
        Console.WriteLine("  \"impl\": \"csharp\",");
        Console.WriteLine(
            $"  \"n\": {o.N}, \"t\": {o.T}, \"rho\": {G17(o.Rho)}, \"sigmaMu\": {G17(o.SigmaMu)},");
        Console.WriteLine(
            $"  \"reps\": {o.Reps}, \"seed\": {o.Seed}, " +
            $"\"collapse\": {(o.Collapse ? "true" : "false")},");
        Console.WriteLine(
            $"  \"first\": {{\"ols\": {G17(first.Ols)}, \"fe\": {G17(first.Fe)}, " +
            $"\"diff\": {G17(first.Diff)}, \"sys\": {G17(first.Sys)}}},");
        Console.WriteLine(Block("ols", ols));
        Console.WriteLine(Block("fe", fe));
        Console.WriteLine(Block("diff", diff));
        Console.WriteLine(Block("sys", sys));
        Console.WriteLine($"  \"bracket\": {G17((double)bracket / o.Reps)}");
        Console.WriteLine("}");
    }

    private static void WriteTable(
        Options o, List<double> ols, List<double> fe, List<double> diff, List<double> sys, int bracket)
    {
        void Row(string name, List<double> v)
        {
            Summary s = Estimators.Summarise(v);
            Console.WriteLine(
                $"  {name,-16} {s.Mean,8:F3} {s.Mean - o.Rho,8:+0.000;-0.000} {s.Sd,8:F3} " +
                $"{Estimators.Rmse(v, o.Rho),8:F3}");
        }

        Console.WriteLine(
            $"N = {o.N}, T = {o.T}, rho = {o.Rho:F2}, sd(mu) = {o.SigmaMu:F2}, " +
            $"{o.Reps} reps, seed {o.Seed}, " +
            $"{(o.Collapse ? "collapsed" : "uncollapsed")} instruments\n");
        Console.WriteLine($"  {"estimator",-16} {"mean",8} {"bias",8} {"sd",8} {"rmse",8}");

        Row("pooled OLS", ols);
        Row("fixed effects", fe);
        Row("difference GMM", diff);
        Row("system GMM", sys);

        double nickell = o.Rho - ((1.0 + o.Rho) / (o.T - 1));
        Console.WriteLine($"\n  Nickell approximation for FE: {nickell:F3}");
        Console.WriteLine($"  Sanity bracket held in {100.0 * bracket / o.Reps:F0}% of draws");
    }
}

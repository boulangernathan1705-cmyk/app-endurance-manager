// Point d'entrée des tests de rejeu :
//   dotnet run -c Release                       tous les tests (séances de fixtures/), résultats dans out/
//   dotnet run -c Release -- rejouer <f.emrec>   rejoue un enregistrement du plugin, chiffres du dash dans out/
//   dotnet run -c Release -- fabriquer <f.json> <sortie.emrec>   la mémoire de LMU refaite depuis une séance
using System;
using System.IO;
using System.Linq;

namespace EnduranceManager.SimHub.Replay
{
    static class Program
    {
        static int Main(string[] args)
        {
            System.Threading.Thread.CurrentThread.CurrentCulture = System.Globalization.CultureInfo.InvariantCulture;
            Console.OutputEncoding = System.Text.Encoding.UTF8;
            string here = AppContext.BaseDirectory;
            string out_ = Path.GetFullPath(Environment.GetEnvironmentVariable("REPLAY_OUT") ?? Path.Combine(here, "out"));
            Directory.CreateDirectory(out_);
            try
            {
                if (args.Length >= 3 && args[0] == "fabriquer")
                {
                    Synth.Write(Fixture.Load(args[1]), args[2]);
                    Console.WriteLine("Écrit : " + args[2]);
                    return 0;
                }
                // The dash « Endurance Manager · Mur » as SimHub's Dash Studio gets it (its items), for the picture (dash-render.mjs).
                if (args.Length >= 2 && args[0] == "dash-mur")
                {
                    File.WriteAllText(args[1], WallDash.Items().ToString(Newtonsoft.Json.Formatting.None));
                    Console.WriteLine("Écrit : " + args[1]);
                    return 0;
                }
                if (args.Length >= 2 && args[0] == "rejouer")
                {
                    var run = Replayer.Run(args[1], null, out_);
                    Console.WriteLine($"{run.Frames} lectures, {run.Sessions.Count} séance(s), {run.Errors.Count} erreur(s). Chiffres du dash : {run.DashFile}");
                    foreach (var e in run.Errors.Take(20)) Console.WriteLine("  " + e);
                    return run.Errors.Count == 0 ? 0 : 1;
                }
                var fixtures = Directory.GetFiles(Path.Combine(here, "fixtures"), "*.json").OrderBy(f => f).ToList();
                return Checks.RunAll(fixtures, out_) ? 0 : 1;
            }
            catch (Exception e)
            {
                Console.WriteLine("ÉCHEC : " + e);
                return 2;
            }
        }
    }
}

// Calculs à la façon de LMU Drive (plugin 2.5), faits ici sur la mémoire du jeu, notre propre code :
// - pour chaque voiture, le chrono de son dernier arrêt (entrée dans la voie, temps arrêté au stand, sortie) et les
//   tours faits depuis sa sortie des stands, pour afficher « SORTIE n/3 » ;
// - pour notre voiture, le tour optimal (somme des meilleurs secteurs de la séance), le tour prévu (meilleur tour du
//   jeu + delta du jeu), les chocs du relais et les blocages de roue du tour ;
// - la place prévue dans la catégorie hors course (notre tour prévu parmi les meilleurs tours de la catégorie) ;
// - la sortie des stands : si on s'arrêtait maintenant, la place dans la catégorie à la sortie et les voitures juste
//   devant et derrière (temps perdu = trajet dans la voie + arrêt du dernier arrêt de la séance, mesurés) ;
// - dix micro-secteurs de longueur égale : leur temps au dernier tour contre le meilleur de la séance.
// Des chiffres bruts, aucun conseil.
using System;
using System.Collections.Generic;
using System.Linq;

namespace EnduranceManager.SimHub
{
    public class Computed
    {
        const int ScoringInfo = 1632, VehScoring = 2192, VehSize = 584, MaxVehicles = 104;

        // One car's pit lane, as seen ten times a second.
        public class CarPit
        {
            public double EnterET = -1, StopStart = -1, StopEnd = -1;
            public bool InLane, Stopped;
            // The last stop done: lane time and time stopped in the box (s), the laps the car had when it left the lane.
            public double? Lane, Box;
            public int ExitLaps = -1;
        }

        readonly Dictionary<int, CarPit> cars = new Dictionary<int, CarPit>();
        double lastET = -1;
        int session = -1;

        // Ours: game time of the last impact counted, impacts this stint, lockups this lap and last lap.
        double impactET;
        bool locking;
        int lockupsLap, lapsDone = -1;

        public int Impacts { get; private set; }
        public int LockupsLastLap { get; private set; }
        public double? Optimal { get; private set; }
        public double? Predicted { get; private set; }
        // Outside races: our predicted lap's place among our class's best laps.
        public int? PredictedPlace { get; private set; }
        // Stopping now: the stop's time lost (s), our class place at the exit, the gaps to the class cars just ahead and
        // behind there (s) and their numbers, null when no stop of ours was measured this session.
        public double? RejoinLoss { get; private set; }
        public int? RejoinPlace { get; private set; }
        public double? RejoinAhead { get; private set; }
        public double? RejoinBehind { get; private set; }
        public string RejoinAheadCar { get; private set; }
        public string RejoinBehindCar { get; private set; }
        // Ten micro-sectors: last lap minus the session's best for each (s), and their sum against the best (the lap's
        // micro-sector optimum).
        public const int Micro = 10;
        public double?[] MicroDelta { get; private set; } = new double?[Micro];
        public double? MicroOptimal { get; private set; }
        double[] microBest = new double[Micro], microStart = new double[Micro + 1];
        int microAt = -1, microLap = -1;
        string microKey;

        // Laps since the car left the pits (null: never stopped this session), its last lane and box times.
        public int? OutLaps(int id, int laps) => cars.TryGetValue(id, out var car) && car.ExitLaps >= 0 && !car.InLane ? laps - car.ExitLaps : (int?)null;
        public CarPit Pit(int id) => cars.TryGetValue(id, out var car) ? car : null;

        static double F64(byte[] b, int at) => BitConverter.ToDouble(b, at);
        static int I32(byte[] b, int at) => BitConverter.ToInt32(b, at);
        static short I16(byte[] b, int at) => BitConverter.ToInt16(b, at);

        public void Update(byte[] b, Sample s, LiveSession current)
        {
            double et = F64(b, ScoringInfo + 68);
            // A new session or the clock going back (restart): everything starts over.
            if (s.Session != session || et + 5 < lastET || s.Track + s.Car != microKey) { microKey = s.Track + s.Car; microBest = new double[Micro]; microAt = -1; MicroDelta = new double?[Micro]; MicroOptimal = null; }
            if (s.Session != session || et + 5 < lastET) { cars.Clear(); session = s.Session; Impacts = 0; impactET = s.ImpactET; lockupsLap = 0; LockupsLastLap = 0; lapsDone = s.LapsDone; }
            lastET = et;
            int count = Math.Min(I32(b, ScoringInfo + 104), MaxVehicles);
            for (int i = 0; i < count; i++)
            {
                int at = VehScoring + i * VehSize, id = I32(b, at);
                if (!cars.TryGetValue(id, out var car)) cars[id] = car = new CarPit();
                bool inLane = b[at + 198] != 0, garage = b[at + 507] != 0;
                double vx = F64(b, at + 288), vy = F64(b, at + 296), vz = F64(b, at + 304);
                double speed = Math.Sqrt(vx * vx + vy * vy + vz * vz);
                if (inLane && !car.InLane) { car.InLane = true; car.EnterET = garage ? -1 : et; car.Stopped = false; car.StopStart = car.StopEnd = -1; }
                else if (inLane)
                {
                    if (speed < 0.3) { if (!car.Stopped) { car.Stopped = true; car.StopStart = et; } car.StopEnd = et; }
                }
                else if (car.InLane)
                {
                    car.InLane = false;
                    car.ExitLaps = I16(b, at + 100);
                    // A lane entered from the track and a stop in it: its times (leaving the garage is not a stop).
                    if (car.EnterET >= 0 && et - car.EnterET < 600) { car.Lane = Math.Round(et - car.EnterET, 1); car.Box = car.Stopped ? Math.Round(car.StopEnd - car.StopStart, 1) : 0; }
                }
            }
            // Ours: a new impact (its game time moved), lockups (a wheel turning 60 % slower than the ground, braking).
            if (s.ImpactET > impactET + 0.5 && s.ImpactForce > 0) Impacts++;
            impactET = Math.Max(impactET, s.ImpactET);
            if (s.InPits && s.Speed < 1) Impacts = 0;
            bool lockNow = s.BrakePedal > 0.1 && s.Speed > 40 && s.Wheels.Any(w => w.Slip < -0.6);
            if (lockNow && !locking) lockupsLap++;
            locking = lockNow;
            if (s.LapsDone != lapsDone) { LockupsLastLap = lockupsLap; lockupsLap = 0; lapsDone = s.LapsDone; }
            // The optimal lap: the session's best three sectors of ours; the predicted one: the game's best lap plus its delta.
            var laps = current?.Laps.Where(l => l.S1 > 0 && l.S2 > 0 && l.S3 > 0 && !l.Invalid).ToList();
            Optimal = laps != null && laps.Count > 0 ? Math.Round(laps.Min(l => l.S1.Value) + laps.Min(l => l.S2.Value) + laps.Min(l => l.S3.Value), 3) : (double?)null;
            int me = VehScoring + Enumerable.Range(0, count).FirstOrDefault(i => I32(b, VehScoring + i * VehSize) == s.Id) * VehSize;
            double best = F64(b, me + 144);
            Predicted = best > 0 && best < 3600 && Math.Abs(s.DeltaBest) < 60 && !s.InPits ? Math.Round(best + s.DeltaBest, 3) : (double?)null;
            double length = F64(b, ScoringInfo + 88);
            bool race = s.Session >= 10 && s.Session <= 13;
            // Outside races: where the predicted lap would stand among the class's best laps (ours left out).
            if (!race && Predicted.HasValue)
            {
                int place = 1;
                for (int i = 0; i < count; i++)
                {
                    int at = VehScoring + i * VehSize;
                    if (I32(b, at) == s.Id || Text(b, at + 200, 32) != s.Class) continue;
                    double theirs = F64(b, at + 144);
                    if (theirs > 0 && theirs < Predicted.Value) place++;
                }
                PredictedPlace = place;
            }
            else PredictedPlace = null;
            Rejoin(b, s, current, count, length);
            MicroSectors(s, et, length);
        }

        static string Text(byte[] b, int at, int size)
        {
            int end = Array.IndexOf(b, (byte)0, at, size);
            return System.Text.Encoding.UTF8.GetString(b, at, (end < 0 ? at + size : end) - at).Trim();
        }

        // Each car's place in time around the lap after our best lap's profile: the time our best lap takes from the line
        // to where the car is. Stopping now costs `loss`: a class car that is less than `loss` behind us on track passes.
        void Rejoin(byte[] b, Sample s, LiveSession current, int count, double length)
        {
            RejoinLoss = null; RejoinPlace = null; RejoinAhead = RejoinBehind = null; RejoinAheadCar = RejoinBehindCar = null;
            var profile = current?.Trace != null && length > 100 ? LiveShare.Profile(current.Trace, length) : null;
            var stop = current?.Stops.LastOrDefault(x => x.Stationary > 0);
            if (profile == null || stop == null) return;
            double? drive = LiveShare.Drive(stop, profile, length);
            if (!drive.HasValue) return;
            double loss = drive.Value + stop.Stationary, lap = profile[100];
            double At(double dist) { double x = Math.Max(0, Math.Min(0.99999, dist / length)) * 100; int k = (int)x; return profile[k] + (profile[k + 1] - profile[k]) * (x - k); }
            double mine = At(s.LapDist);
            // Our race progress in seconds of our best lap, and every class car's: its gap behind us at the exit is its
            // progress minus ours plus the loss.
            double ourProgress = s.LapsDone * lap + mine;
            var gaps = new List<(double gap, string car)>();
            for (int i = 0; i < count; i++)
            {
                int at = VehScoring + i * VehSize;
                if (I32(b, at) == s.Id || Text(b, at + 200, 32) != s.Class || b[at + 103] != 0) continue;
                double progress = I16(b, at + 100) * lap + At(F64(b, at + 104));
                gaps.Add((ourProgress - loss - progress, Text(b, at + 36, 64)));
            }
            // gap < 0: the car is ahead of us at the exit by that much; >= 0: behind.
            RejoinLoss = Math.Round(loss, 1);
            RejoinPlace = 1 + gaps.Count(g => g.gap < 0);
            var ahead = gaps.Where(g => g.gap < 0).OrderByDescending(g => g.gap).FirstOrDefault();
            var behind = gaps.Where(g => g.gap >= 0).OrderBy(g => g.gap).FirstOrDefault();
            if (ahead.car != null) { RejoinAhead = Math.Round(-ahead.gap, 1); RejoinAheadCar = ahead.car; }
            if (behind.car != null) { RejoinBehind = Math.Round(behind.gap, 1); RejoinBehindCar = behind.car; }
        }

        // The game time at each tenth of the lap as the car crosses it; at the line, the ten parts against the best.
        void MicroSectors(Sample s, double et, double length)
        {
            if (length < 100 || s.InPits) { microAt = -1; return; }
            int part = (int)Math.Max(0, Math.Min(Micro - 1, s.LapDist / length * Micro));
            if (s.LapsDone != microLap)
            {
                // The line: a lap complete point by point closes, then a new one starts.
                if (microAt == Micro - 1 && microLap >= 0)
                {
                    microStart[Micro] = et;
                    var delta = new double?[Micro];
                    bool clean = !s.Invalid;
                    for (int k = 0; k < Micro; k++)
                    {
                        double time = microStart[k + 1] - microStart[k];
                        if (time <= 0 || microStart[k] <= 0) { clean = false; continue; }
                        if (microBest[k] > 0) delta[k] = Math.Round(time - microBest[k], 3);
                        if (clean && (microBest[k] <= 0 || time < microBest[k])) microBest[k] = time;
                    }
                    MicroDelta = delta;
                    MicroOptimal = microBest.All(t => t > 0) ? Math.Round(microBest.Sum(), 3) : (double?)null;
                }
                microLap = s.LapsDone; microStart = new double[Micro + 1]; microStart[0] = part == 0 ? et : 0; microAt = part == 0 ? 0 : -1;
                return;
            }
            if (microAt >= 0 && part == microAt + 1) { microStart[part] = et; microAt = part; }
            else if (part != microAt) microAt = -1;
        }
    }
}

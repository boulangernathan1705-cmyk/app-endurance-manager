// Calculs à la façon de LMU Drive (plugin 2.5), faits ici sur la mémoire du jeu, notre propre code :
// - pour chaque voiture, le chrono de son dernier arrêt (entrée dans la voie, temps arrêté au stand, sortie) et les
//   tours faits depuis sa sortie des stands, pour afficher « SORTIE n/3 » ;
// - pour notre voiture, le tour optimal (somme des meilleurs secteurs de la séance), le tour prévu (meilleur tour du
//   jeu + delta du jeu), les chocs du relais et les blocages de roue du tour.
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
        }
    }
}

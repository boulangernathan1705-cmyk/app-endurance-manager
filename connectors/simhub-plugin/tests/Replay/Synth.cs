// Une séance des fiches combo (fixtures/*.json) refaite en mémoire de LMU, dix fois par seconde, au format de
// l'enregistreur du plugin (Tape.cs). Les offsets sont ceux que le plugin lit (LmuMemory.Read) : écrire ici, c'est
// relire là-bas. Ce qui n'est pas dans la séance est tenu constant (trois voitures de la même catégorie autour, à
// rythme fixe, pour les calculs de place et de sortie des stands).
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using Newtonsoft.Json.Linq;

namespace EnduranceManager.SimHub.Replay
{
    public class Fixture
    {
        public class Lap
        {
            public int N;
            public double? T, S1, S2, S3;
            public double Fuel, Ve, Temp, Kpa, Brake, TrackTemp, Air, Rain, Wet, Top;
            public double[] Wear = new double[4];
            public string Compound;
            public bool Invalid, Pit;
        }

        public class Stop { public int Lap, Tyres; public double Lane, Stopped, Fuel, Ve; public bool Repair; }

        public class Point { public double Time, Dist, X, Z, Speed, Throttle, Brake; public int Gear; }

        public string Name, File, Track, Car, Class;
        public int Session;
        public double Capacity;
        public JObject Service;
        public List<Lap> Laps = new List<Lap>();
        public List<Stop> Stops = new List<Stop>();
        public int TraceLap;
        public double TraceTime;
        public List<Point> Trace = new List<Point>();

        static double? N(string text) => string.IsNullOrEmpty(text) ? (double?)null : double.Parse(text, CultureInfo.InvariantCulture);

        public static Fixture Load(string path)
        {
            var json = JObject.Parse(System.IO.File.ReadAllText(path));
            var f = new Fixture
            {
                Name = (string)json["name"], File = Path.GetFileNameWithoutExtension(path), Track = (string)json["track"], Car = (string)json["car"],
                Class = (string)json["class"], Session = (int?)json["session"] ?? 2, Capacity = (double)json["capacity"], Service = json["service"] as JObject,
                TraceLap = (int)json["trace"]["lap"], TraceTime = (double)json["trace"]["time"]
            };
            foreach (var row in ((string)json["laps"]).Split(';'))
            {
                var c = row.Split(',');
                f.Laps.Add(new Lap
                {
                    N = int.Parse(c[0]), T = N(c[1]), S1 = N(c[2]), S2 = N(c[3]), S3 = N(c[4]), Fuel = N(c[5]) ?? 0, Ve = N(c[6]) ?? 0,
                    Wear = new[] { N(c[7]) ?? 0, N(c[8]) ?? 0, N(c[9]) ?? 0, N(c[10]) ?? 0 }, Temp = N(c[11]) ?? 0, Kpa = N(c[12]) ?? 0, Brake = N(c[13]) ?? 0,
                    Compound = c[14], TrackTemp = N(c[15]) ?? 0, Air = N(c[16]) ?? 0, Rain = N(c[17]) ?? 0, Wet = N(c[18]) ?? 0, Top = N(c[19]) ?? 0,
                    Invalid = c[20] == "1", Pit = c[21] == "1"
                });
            }
            foreach (var s in json["stops"])
                f.Stops.Add(new Stop { Lap = (int)s[0], Lane = (double)s[1], Stopped = (double)s[2], Fuel = (double)s[3], Ve = (double)s[4], Tyres = (int)s[5], Repair = (int)s[6] == 1 });
            foreach (var p in ((string)json["trace"]["points"]).Split(';'))
            {
                var c = p.Split(',').Select(x => double.Parse(x, CultureInfo.InvariantCulture)).ToArray();
                f.Trace.Add(new Point { Time = c[0], Dist = c[1], X = c[2], Z = c[3], Speed = c[4], Throttle = c[5], Brake = c[6], Gear = (int)c[7] });
            }
            return f;
        }
    }

    // A copy of LMU's shared memory being written: the fields LmuMemory.Read, Computed, Course and LiveShare read.
    public class Memory
    {
        const int SI = LmuMemory.ScoringInfo, VS = LmuMemory.VehScoring, VZ = LmuMemory.VehSize, TO = LmuMemory.TelemetryOff, TI = LmuMemory.TelemInfo;
        public readonly byte[] B = new byte[LmuMemory.Size];

        public void F64(int at, double v) => BitConverter.GetBytes(v).CopyTo(B, at);
        public void F32(int at, double v) => BitConverter.GetBytes((float)v).CopyTo(B, at);
        public void I32(int at, int v) => BitConverter.GetBytes(v).CopyTo(B, at);
        public void I16(int at, int v) => BitConverter.GetBytes((short)v).CopyTo(B, at);
        public void Text(int at, int size, string text)
        {
            Array.Clear(B, at, size);
            var bytes = Encoding.UTF8.GetBytes(text ?? "");
            Array.Copy(bytes, 0, B, at, Math.Min(bytes.Length, size - 1));
        }

        public static int Vehicle(int slot) => VS + slot * VZ;
        public const int Telemetry = TI;

        public void Session(string track, int session, double et, double length, int cars, double rain, double air, double trackTemp, double wet)
        {
            Text(SI, 64, track); I32(SI + 64, session); F64(SI + 68, et); F64(SI + 76, 3600 * 4); I32(SI + 84, 0); F64(SI + 88, length);
            I32(SI + 104, cars); B[SI + 115] = 1; F64(SI + 220, rain); F64(SI + 228, air); F64(SI + 236, trackTemp);
            F64(SI + 268, wet); F64(SI + 276, wet); F64(SI + 332, wet); F32(SI + 344, 14 * 3600 + et); B[SI + 352] = 0;
            // Our car's telemetry in slot 0, the only one filled (as offline with AI).
            B[TO] = 1; B[TO + 1] = 0; B[TO + 2] = 1;
        }

        public class Car
        {
            public int Id, Laps, Place, Stops;
            public string Driver, Vehicle, Class;
            public double Dist, X, Z, Speed, Best, LastLap = -1, LastS1 = -1, LastS2 = -1;
            public bool Player, InPits;
        }

        public void Scoring(int slot, Car c)
        {
            int v = Vehicle(slot);
            I32(v, c.Id); Text(v + 4, 32, c.Driver); Text(v + 36, 64, c.Vehicle); I16(v + 100, c.Laps); B[v + 102] = 0; B[v + 103] = 0;
            F64(v + 104, c.Dist); F64(v + 144, c.Best); F64(v + 152, c.LastS1); F64(v + 160, c.LastS2); F64(v + 168, c.LastLap);
            I16(v + 192, c.Stops); B[v + 196] = (byte)(c.Player ? 1 : 0); B[v + 197] = (byte)(c.Player ? 0 : 1); B[v + 198] = (byte)(c.InPits ? 1 : 0);
            B[v + 199] = (byte)c.Place; Text(v + 200, 32, c.Class);
            F64(v + 264, c.X); F64(v + 280, c.Z); F64(v + 288, c.Speed / 3.6); F64(v + 296, 0); F64(v + 304, 0);
            B[v + 457] = (byte)(c.InPits ? 4 : 0); B[v + 506] = 1; B[v + 507] = 0; F32(v + 524, 0);
        }

        public class Physics
        {
            public int Id, Gear;
            public double Et, X, Z, Speed, Fuel, Capacity, Energy, Throttle, Brake, Water = 85, Oil = 100;
            public string Car, Compound;
            public double[] Wear = new double[4];
            public double Temp, Kpa, BrakeTemp;
        }

        public void Telemetry0Write(Physics p)
        {
            int t = TI;
            I32(t, p.Id); F64(t + 12, p.Et); F64(t + 160, p.X); F64(t + 176, p.Z); F64(t + 184, p.Speed / 3.6); F64(t + 192, 0); F64(t + 200, 0);
            I32(t + 352, p.Gear); F64(t + 364, p.Water); F64(t + 372, p.Oil); F64(t + 388, p.Throttle); F64(t + 396, p.Brake); F64(t + 404, 0);
            F64(t + 524, p.Fuel); F64(t + 608, p.Capacity); F32(t + 776, p.Energy / 100); B[t + 745] = 0;
            Text(t + 620, 18, p.Compound); Text(t + 638, 18, p.Compound); Text(t + 796, 30, p.Car);
            F64(t + 664, 0.46); B[t + 750] = 3; B[t + 751] = 9; B[t + 756] = 2; B[t + 757] = 9; B[t + 758] = 1; B[t + 759] = 5;
            for (int i = 0; i < 4; i++)
            {
                int w = t + 848 + i * 260;
                double k = p.Temp + 273.15;
                F64(w + 152, p.Wear[i]); F64(w + 120, p.Kpa); F64(w + 24, p.BrakeTemp + 273.15); F64(w + 204, k);
                F64(w + 128, k); F64(w + 136, k); F64(w + 144, k); F64(w + 212, k); F64(w + 220, k); F64(w + 228, k);
                F64(w + 8, 0.032); B[w + 179] = 34;
            }
        }
    }

    public static class Synth
    {
        const double Step = 0.1;

        // The trace as a function of the lap's progress (0 to 1): distance, position, speed, pedals, gear.
        class Shape
        {
            readonly List<Fixture.Point> p;
            public readonly double Length, Top;
            public Shape(List<Fixture.Point> points, double lapTime)
            {
                p = points;
                var last = points[points.Count - 1];
                // The line is crossed between the last point and the first of the next lap.
                Length = last.Dist + last.Speed / 3.6 * Math.Max(0.05, lapTime - last.Time);
                Top = points.Max(x => x.Speed);
            }
            public Fixture.Point At(double fraction, double lapTime)
            {
                double time = fraction * p[p.Count - 1].Time;
                int k = 0;
                while (k < p.Count - 2 && p[k + 1].Time < time) k++;
                var a = p[k]; var b = p[k + 1];
                double u = Math.Max(0, Math.Min(1, (time - a.Time) / Math.Max(1e-6, b.Time - a.Time)));
                double L(double x, double y) => x + (y - x) * u;
                return new Fixture.Point { Dist = Math.Max(0, Math.Min(Length - 1, fraction * Length)), X = L(a.X, b.X), Z = L(a.Z, b.Z), Speed = L(a.Speed, b.Speed),
                    Throttle = L(a.Throttle, b.Throttle), Brake = L(a.Brake, b.Brake), Gear = u < 0.5 ? a.Gear : b.Gear };
            }
        }

        public static void Write(Fixture f, string path)
        {
            var laps = f.Laps;
            // Each lap's duration: its time, or the one before when the game gave none.
            var duration = new double[laps.Count];
            double previous = laps.Where(l => l.T > 0).Select(l => l.T.Value).DefaultIfEmpty(120).Min();
            for (int k = 0; k < laps.Count; k++) { duration[k] = laps[k].T > 0 ? laps[k].T.Value : previous; previous = duration[k]; }
            var start = new double[laps.Count + 1];
            for (int k = 0; k < laps.Count; k++) start[k + 1] = start[k] + duration[k];
            var shape = new Shape(f.Trace, f.TraceTime);
            double length = shape.Length;
            double pace = laps.Where(l => l.T > 0 && !l.Pit).Select(l => l.T.Value).OrderBy(x => x).ElementAt(laps.Count(l => l.T > 0 && !l.Pit) / 2);

            // The stops: lane entry a few seconds before the line of the in-lap, the car stopped in the out-lap.
            const double before = 8;
            var lanes = f.Stops.Select(s => new
            {
                Stop = s,
                Enter = start[s.Lap] - before,
                Halt = start[s.Lap] + Math.Max(1, (s.Lane - before - s.Stopped) / 2),
                Exit = start[s.Lap] + s.Lane - before
            }).ToList();
            // A lap through the pits with no stop after it (the session ended in the lane): the lane at its end.
            var endsInLane = laps.Where(l => l.Pit && !f.Stops.Any(x => x.Lap == l.N || x.Lap + 1 == l.N)).Select(l => start[l.N] - before).ToList();

            // The levels at each lap's start, worked back from the stops (what each stop added, the laps' use).
            double fuelUse = laps.Where(l => l.Fuel > 0).Select(l => l.Fuel).DefaultIfEmpty(0).Average();
            double veUse = laps.Where(l => l.Ve > 0).Select(l => l.Ve).DefaultIfEmpty(0).Average();
            double Use(Fixture.Lap l, bool ve) => ve ? (l.Pit ? veUse : l.Ve) : (l.Pit ? fuelUse : l.Fuel);
            double StartLevel(bool ve, double cap)
            {
                // Before the first stop, the car arrives with what that stop's top-up leaves room for; no stop: nearly full.
                var first = f.Stops.FirstOrDefault();
                double used = laps.TakeWhile(l => first == null || l.N <= first.Lap).Sum(l => Use(l, ve));
                double arrive = first == null ? 1 : Math.Max(0.5, cap - (ve ? first.Ve : first.Fuel));
                return Math.Max(used + arrive, ve && veUse == 0 ? 0 : used + 0.5);
            }
            double fuel = StartLevel(false, f.Capacity), energy = veUse > 0 ? StartLevel(true, 100) : 0;
            var wear = new[] { 1.0, 1.0, 1.0, 1.0 };
            string compound = laps[0].Compound;

            var m = new Memory();
            var rivals = new[] { 1.003, 0.996, 1.012 }.Select((k, i) => new { Pace = pace * k, Offset = 0.25 * (i + 1), Car = new Memory.Car { Id = i + 2, Driver = "Rival " + (i + 1), Vehicle = f.Car + " #" + (20 + i), Class = f.Class } }).ToList();
            var us = new Memory.Car { Id = 1, Driver = "Pilote", Vehicle = f.Car + " #7", Class = f.Class, Player = true };
            double best = 0;
            using (var tape = new Tape.Writer(path, "{\"format\":1,\"plugin\":\"synthèse\",\"fixture\":\"" + f.File + "\",\"memory\":" + LmuMemory.Size + "}"))
            {
                int k = 0;
                bool crossed = false;
                for (double t = 0; t < start[laps.Count] + 2; t += Step)
                {
                    int was = k;
                    while (k < laps.Count - 1 && t >= start[k + 1]) k++;
                    bool line = k != was || (t >= start[laps.Count] && !crossed);
                    if (t >= start[laps.Count]) crossed = true;
                    bool after = t >= start[laps.Count];
                    var lap = laps[k];
                    var lane = lanes.FirstOrDefault(x => t >= x.Enter && t < x.Exit);
                    bool inLane = lane != null || endsInLane.Any(x => t >= x && t < x + before + 1);
                    bool halted = lane != null && t >= lane.Halt && t < lane.Halt + lane.Stop.Stopped;
                    // Progress in the lap, the time stopped left out.
                    double stopped = lanes.Where(x => x.Halt >= start[k] && x.Halt < start[k + 1]).Sum(x => Math.Max(0, Math.Min(t, x.Halt + x.Stop.Stopped) - x.Halt));
                    double run = lanes.Where(x => x.Halt >= start[k] && x.Halt < start[k + 1]).Sum(x => x.Stop.Stopped);
                    double fraction = after ? 0.01 : Math.Max(0, Math.Min(0.99999, (t - start[k] - stopped) / (duration[k] - run)));
                    var point = shape.At(fraction, duration[k]);
                    double speed = halted ? 0 : inLane ? Math.Min(60, point.Speed) : (lap.Top > 0 ? Math.Min(lap.Top, point.Speed * lap.Top / shape.Top * 1.01) : point.Speed);

                    // Levels: used along the lap on track, topped up while stopped.
                    // Each lap's use over the part of this step it covers (a step can straddle the line).
                    if (!inLane)
                        for (int j = Math.Max(0, k - 1); j <= k; j++)
                        {
                            double share = Math.Max(0, Math.Min(t, start[j + 1]) - Math.Max(t - Step, start[j])) / duration[j];
                            if (share <= 0) continue;
                            fuel -= Use(laps[j], false) * share;
                            energy -= Use(laps[j], true) * share;
                            for (int i = 0; i < 4; i++) wear[i] -= (laps[j].Pit ? 0 : laps[j].Wear[i]) / 100 * share;
                        }
                    if (halted)
                    {
                        double share = Step / lane.Stop.Stopped;
                        fuel += lane.Stop.Fuel * share;
                        energy += lane.Stop.Ve * share;
                        if (lane.Stop.Tyres == 4) { wear = new[] { 1.0, 1.0, 1.0, 1.0 }; compound = laps[Math.Min(laps.Count - 1, lane.Stop.Lap)].Compound; }
                    }

                    // The line: the lap just done, with its sectors.
                    int done = after ? laps.Count : k;
                    if (done > 0)
                    {
                        var last = laps[done - 1];
                        us.LastLap = last.T > 0 ? last.T.Value : -1;
                        us.LastS1 = last.S1 > 0 ? last.S1.Value : -1;
                        us.LastS2 = last.S1 > 0 && last.S2 > 0 ? last.S1.Value + last.S2.Value : -1;
                        best = laps.Take(done).Where(l => l.T > 0 && !l.Invalid).Select(l => l.T.Value).DefaultIfEmpty(0).Min();
                    }
                    us.Laps = done; us.Dist = point.Dist; us.X = point.X; us.Z = point.Z; us.Speed = speed; us.Best = best; us.InPits = inLane;
                    us.Stops = lanes.Count(x => t >= x.Exit);
                    double ourRun = done + fraction;
                    var places = new List<(Memory.Car car, double run)> { (us, ourRun) };
                    foreach (var r in rivals)
                    {
                        double theirs = t / r.Pace + r.Offset;
                        int theirLaps = (int)Math.Floor(theirs);
                        var at = shape.At(theirs - theirLaps, r.Pace);
                        r.Car.Laps = theirLaps; r.Car.Dist = at.Dist; r.Car.X = at.X; r.Car.Z = at.Z; r.Car.Speed = at.Speed;
                        r.Car.Best = theirLaps > 0 ? r.Pace : 0; r.Car.LastLap = theirLaps > 0 ? r.Pace : -1;
                        places.Add((r.Car, theirs));
                    }
                    int place = 1;
                    foreach (var (car, _) in places.OrderByDescending(x => x.run)) car.Place = place++;

                    // What the game shows at the line belongs to the lap just done (the plugin closes a lap on the first
                    // reading after the line): that reading keeps the finished lap's conditions.
                    var cond = after || line ? laps[Math.Max(0, done - 1)] : lap;
                    m.Session(f.Track, f.Session, t, length, 1 + rivals.Count, cond.Rain, cond.Air, cond.TrackTemp, cond.Wet);
                    m.Scoring(0, us);
                    for (int i = 0; i < rivals.Count; i++) m.Scoring(i + 1, rivals[i].Car);
                    m.Telemetry0Write(new Memory.Physics
                    {
                        Id = 1, Et = t, X = point.X, Z = point.Z, Speed = speed, Fuel = fuel, Capacity = f.Capacity, Energy = energy,
                        Throttle = halted ? 0 : point.Throttle, Brake = halted ? 0 : point.Brake, Gear = halted ? 0 : point.Gear, Car = f.Car, Compound = compound,
                        Wear = (double[])wear.Clone(), Temp = cond.Temp, Kpa = cond.Kpa, BrakeTemp = cond.Brake
                    });
                    tape.Frame(t, m.B);
                }
            }
        }
    }
}

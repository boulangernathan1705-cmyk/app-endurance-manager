// Données en direct : pendant que le pilote roule, LMU publie son état dans la mémoire partagée « LMU_Data »
// (offsets de pyLMUSharedMemory, repris de l'ancien plugin retiré en v1.51) : par tour, l'usure, les températures
// et les pressions des pneus, la gomme, les freins, la vitesse max, le carburant en litres, l'énergie virtuelle,
// la pluie et l'humidité de la piste, les temps des trois secteurs ; chaque arrêt aux stands décomposé ; et la trace du
// meilleur tour propre de la séance (position, vitesse, pédales, pneus, hauteur, dix points par seconde) pour l'analyse du
// tour sur la carte. Le site les lit dans cleanSession (shared/combos.mjs).
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using Newtonsoft.Json;

namespace EnduranceManager.SimHub
{
    public struct Wheel
    {
        public double Temp, Wear, Pressure, Brake;
        // The tread's middle temperature (°C, it swings corner by corner) and how much the wheel turns slower (-) or
        // faster (+) than the car moves over the ground: about -1 when it locks under braking.
        public double Surface, Slip;
        // The tread's inner side minus its outer side (°C) and the ride height at that corner (metres).
        public double Spread, Ride;
    }

    public struct Sample
    {
        public double ET;
        public bool Realtime;
        public int Session;
        public string Track, Car, Class, Driver;
        public double TrackTemp, AirTemp, Rain, Wet;
        public short LapsDone;
        public double LastLap, LastSector1, LastSector2;
        public bool InPits;
        public byte PitState;
        public double Speed, Fuel, FuelCapacity, Energy;
        public int Damage;
        public bool Invalid;
        public string FrontCompound, RearCompound;
        public Wheel[] Wheels;
        // Where the car is (metres, seen from above: x and z), the pedals and the wheel (0 to 1, -1 to 1), the gear and
        // the ride height front and rear (metres).
        public double X, Z, Throttle, BrakePedal, Steer, RideFront, RideRear;
        public int Gear;
        // How far into the lap (metres from the line, mLapDist): lines two laps up point by point.
        public double LapDist;
        public double Water, Oil;
    }

    public static class LmuMemory
    {
        public const string Name = "LMU_Data";
        public const int Size = 324820;
        const int ScoringInfo = 1632, VehScoring = 2192, VehSize = 584, TelemetryOff = 128464, TelemInfo = 128468, TelemSize = 1888, MaxVehicles = 104;

        static double F64(byte[] b, int at) => BitConverter.ToDouble(b, at);
        static double F32(byte[] b, int at) => BitConverter.ToSingle(b, at);
        static int I32(byte[] b, int at) => BitConverter.ToInt32(b, at);
        static short I16(byte[] b, int at) => BitConverter.ToInt16(b, at);

        static string Text(byte[] b, int at, int size)
        {
            int end = Array.IndexOf(b, (byte)0, at, size);
            return Encoding.UTF8.GetString(b, at, (end < 0 ? at + size : end) - at).Trim();
        }

        // Each wheel's rolling radius (metres) on the car being driven, measured as it goes.
        static double[] radius = new double[4];
        static string radiusCar;

        // The player's car from a copy of the shared memory; false when nobody drives.
        public static bool Read(byte[] b, out Sample s)
        {
            s = default;
            // While the game loads, the player's slot can hold anything: never read outside the copy.
            if (b.Length < Size || b[TelemetryOff + 2] == 0 || b[TelemetryOff + 1] >= MaxVehicles) return false;
            int t = TelemInfo + b[TelemetryOff + 1] * TelemSize;
            int id = I32(b, t);
            int count = I32(b, ScoringInfo + 104);
            int v = -1;
            for (int i = 0; i < count && i < MaxVehicles; i++)
            {
                int at = VehScoring + i * VehSize;
                if (b[at + 196] != 0 || I32(b, at) == id) { v = at; break; }
            }
            if (v < 0) return false;
            double vx = F64(b, t + 184), vy = F64(b, t + 192), vz = F64(b, t + 200);
            s = new Sample
            {
                ET = F64(b, t + 12), Realtime = b[ScoringInfo + 115] != 0, Session = I32(b, ScoringInfo + 64),
                Track = Text(b, ScoringInfo, 64), Driver = Text(b, v + 4, 32), Car = Text(b, v + 36, 64), Class = Text(b, v + 200, 32),
                TrackTemp = F64(b, ScoringInfo + 236), AirTemp = F64(b, ScoringInfo + 228), Rain = F64(b, ScoringInfo + 220),
                // How wet the racing line is, between its driest and wettest point (mMinPathWetness, mMaxPathWetness,
                // right after the wind). To check in game: 0 on a dry track, close to 1 after heavy rain.
                Wet = (F64(b, ScoringInfo + 268) + F64(b, ScoringInfo + 276)) / 2,
                LapsDone = I16(b, v + 100), LastLap = F64(b, v + 168),
                // Where the last lap's first and second sectors ended (mLastSector1, mLastSector2: from the line, -1 when unknown).
                LastSector1 = F64(b, v + 152), LastSector2 = F64(b, v + 160), InPits = b[v + 198] != 0, PitState = b[v + 457],
                Speed = Math.Sqrt(vx * vx + vy * vy + vz * vz) * 3.6,
                Fuel = F64(b, t + 524), FuelCapacity = F64(b, t + 608), Energy = F32(b, t + 776) * 100,
                Invalid = b[t + 745] != 0, FrontCompound = Text(b, t + 620, 18), RearCompound = Text(b, t + 638, 18),
                Wheels = new Wheel[4],
                // mPos, the driver's unfiltered inputs and mGear (rF2 telemetry layout, as above).
                X = F64(b, t + 160), Z = F64(b, t + 176), Throttle = F64(b, t + 388), BrakePedal = F64(b, t + 396), Steer = F64(b, t + 404),
                Gear = I32(b, t + 352),
                Water = F64(b, t + 364), Oil = F64(b, t + 372), LapDist = F64(b, v + 104)
            };
            string model = Text(b, t + 796, 30);
            if (model != "") s.Car = model;
            if (s.Car != radiusCar) { radiusCar = s.Car; radius = new double[4]; }
            // Coasting straight (no brake, wheel near centre, above 100 km/h): a free wheel, its rolling radius measured.
            bool free = s.BrakePedal < 0.02 && Math.Abs(s.Steer) < 0.05 && s.Speed > 100;
            for (int i = 0; i < 8; i++) s.Damage += b[t + 544 + i];
            for (int i = 0; i < 4; i++)
            {
                int w = t + 848 + i * 260;
                // The tyre's carcass temperature, the one the game shows (the surface swings by 20 °C a corner); kelvin, as the brakes.
                // Wheel speed from its rotation (rad/s) and rolling radius, against the ground speed under it. The game gives the
                // radius to the centimetre (36 cm reads as a 2.7 % slide at 250 km/h): it is measured on the straights instead.
                double ground = Math.Abs(F64(b, w + 72)), rotation = Math.Abs(F64(b, w + 40));
                if (free && rotation > 1) radius[i] = radius[i] > 0 ? radius[i] * 0.98 + ground / rotation * 0.02 : ground / rotation;
                double turning = rotation * (radius[i] > 0 ? radius[i] : b[w + 179] / 100.0);
                // mTemperature is left, middle, right of the tread: the inner side is the right one on a left wheel.
                double left = F64(b, w + 128), right = F64(b, w + 144);
                s.Wheels[i] = new Wheel
                {
                    Temp = F64(b, w + 204) - 273.15, Wear = F64(b, w + 152),
                    Pressure = F64(b, w + 120), Brake = F64(b, w + 24) - 273.15,
                    Surface = F64(b, w + 136) - 273.15, Slip = ground > 5 ? Math.Max(-1, Math.Min(1, (turning - ground) / ground)) : 0,
                    Spread = i % 2 == 0 ? right - left : left - right, Ride = F64(b, w + 8)
                };
            }
            // LMU leaves mFrontRideHeight and mRearRideHeight at 0: the axle's height is its two wheels' (checked on track).
            s.RideFront = (s.Wheels[0].Ride + s.Wheels[1].Ride) / 2;
            s.RideRear = (s.Wheels[2].Ride + s.Wheels[3].Ride) / 2;
            return true;
        }
    }

    // What is sent for one lap and one stop (percent of the tyre worn, °C, km/h, litres, seconds): the site's format.
    public class LiveLap
    {
        [JsonProperty("n")] public int N;
        [JsonProperty("t")] public double Time;
        [JsonProperty("s1", NullValueHandling = NullValueHandling.Ignore)] public double? S1;
        [JsonProperty("s2", NullValueHandling = NullValueHandling.Ignore)] public double? S2;
        [JsonProperty("s3", NullValueHandling = NullValueHandling.Ignore)] public double? S3;
        [JsonProperty("top")] public double Top;
        [JsonProperty("fuel")] public double Fuel;
        [JsonProperty("ve")] public double Energy;
        [JsonProperty("wear")] public double[] Wear = new double[4];
        [JsonProperty("temp")] public double[] Temp = new double[4];
        [JsonProperty("brake")] public double[] Brake = new double[4];
        [JsonProperty("kpa")] public double[] Pressure = new double[4];
        [JsonProperty("compound")] public string Compound;
        [JsonProperty("track")] public double TrackTemp;
        [JsonProperty("air")] public double AirTemp;
        [JsonProperty("rain")] public double Rain;
        [JsonProperty("wet")] public double Wet;
        [JsonProperty("invalid")] public bool Invalid;
        [JsonProperty("pit")] public bool Pit;
        // The setup the game had loaded when the lap ended (LMU's garage), when known.
        [JsonProperty("setup", NullValueHandling = NullValueHandling.Ignore)] public string Setup;
        // Daylight when the lap ended (0 night, 1 full day), when the game told it in the last minutes.
        [JsonProperty("light", NullValueHandling = NullValueHandling.Ignore)] public double? Light;
    }

    // The best clean lap of the session, point by point (about ten a second), one list per measure: what the lap analysis
    // on the map draws. Seconds from the line, metres, km/h, 0 to 1, °C.
    public class LapTrace
    {
        [JsonProperty("n")] public int N;
        [JsonProperty("t")] public double Time;
        [JsonProperty("time")] public List<double> Clock = new List<double>();
        [JsonProperty("dist")] public List<double> Dist = new List<double>();
        [JsonProperty("x")] public List<double> X = new List<double>();
        [JsonProperty("z")] public List<double> Z = new List<double>();
        [JsonProperty("speed")] public List<double> Speed = new List<double>();
        [JsonProperty("throttle")] public List<double> Throttle = new List<double>();
        [JsonProperty("brake")] public List<double> Brake = new List<double>();
        [JsonProperty("steer")] public List<double> Steer = new List<double>();
        [JsonProperty("gear")] public List<int> Gear = new List<int>();
        [JsonProperty("rideF")] public List<double> RideFront = new List<double>();
        [JsonProperty("rideR")] public List<double> RideRear = new List<double>();
        [JsonProperty("temp")] public List<double>[] Temp = { new List<double>(), new List<double>(), new List<double>(), new List<double>() };
        [JsonProperty("slip")] public List<double>[] Slip = { new List<double>(), new List<double>(), new List<double>(), new List<double>() };

        static double Round(double value, int digits) => Math.Round(value, digits, MidpointRounding.AwayFromZero);

        public void Add(Sample s, double since)
        {
            Clock.Add(Round(since, 2)); Dist.Add(Round(s.LapDist, 1)); X.Add(Round(s.X, 1)); Z.Add(Round(s.Z, 1)); Speed.Add(Round(s.Speed, 1));
            Throttle.Add(Round(s.Throttle, 2)); Brake.Add(Round(s.BrakePedal, 2)); Steer.Add(Round(s.Steer, 2)); Gear.Add(s.Gear);
            RideFront.Add(Round(s.RideFront * 1000, 0)); RideRear.Add(Round(s.RideRear * 1000, 0));
            for (int i = 0; i < 4; i++) { Temp[i].Add(Round(s.Wheels[i].Surface, 0)); Slip[i].Add(Round(s.Wheels[i].Slip, 2)); }
        }
    }

    // The session in numbers, wheel by wheel (FL, FR, RL, RR), on track above 60 km/h: averages and extremes. An extreme is
    // taken on a one-second average, so a lock, a slide or a kerb does not count. °C, kPa, mm, percent.
    public class Expert
    {
        [JsonProperty("samples")] public int Samples;
        [JsonProperty("tyreTemp")] public double[] TyreTemp = new double[4];
        [JsonProperty("tyreTempMax")] public double[] TyreTempMax = new double[4];
        [JsonProperty("kpa")] public double[] Pressure = new double[4];
        [JsonProperty("kpaMax")] public double[] PressureMax = new double[4];
        [JsonProperty("spread")] public double[] Spread = new double[4];
        [JsonProperty("spreadMin")] public double[] SpreadMin = new double[4];
        [JsonProperty("brake")] public double[] Brake = new double[4];
        [JsonProperty("brakeMax")] public double[] BrakeMax = new double[4];
        [JsonProperty("ride")] public double[] Ride = new double[4];
        [JsonProperty("rideMin")] public double[] RideMin = new double[4];
        [JsonProperty("tyreLeft")] public double[] TyreLeft = new double[4];
        [JsonProperty("oil")] public double Oil;
        [JsonProperty("oilMax")] public double OilMax;
        [JsonProperty("water")] public double Water;
        [JsonProperty("waterMax")] public double WaterMax;
    }

    class ExpertState
    {
        // Per measure: running sum, and the extreme of its one-second average (ten samples).
        class Measure
        {
            double sum, window; readonly Queue<double> last = new Queue<double>();
            public double Extreme = double.NaN;
            public void Add(double value, bool high)
            {
                sum += value; last.Enqueue(value); window += value;
                if (last.Count > 10) window -= last.Dequeue();
                if (last.Count < 10) return;
                double mean = window / 10;
                if (double.IsNaN(Extreme) || (high ? mean > Extreme : mean < Extreme)) Extreme = mean;
            }
            public double Mean(int count) => count > 0 ? sum / count : 0;
        }

        int count;
        readonly Measure[] temp = New(), kpa = New(), spread = New(), brake = New(), ride = New();
        readonly Measure oil = new Measure(), water = new Measure();
        double[] left = new double[4];

        static Measure[] New() => new[] { new Measure(), new Measure(), new Measure(), new Measure() };
        static double Round(double value, int digits) => double.IsNaN(value) ? 0 : Math.Round(value, digits, MidpointRounding.AwayFromZero);

        public void Add(Sample s)
        {
            count++;
            for (int i = 0; i < 4; i++)
            {
                var w = s.Wheels[i];
                temp[i].Add(w.Surface, true); kpa[i].Add(w.Pressure, true); spread[i].Add(w.Spread, false);
                brake[i].Add(w.Brake, true); ride[i].Add(w.Ride * 1000, false);
                left[i] = w.Wear * 100;
            }
            oil.Add(s.Oil, true); water.Add(s.Water, true);
        }

        public Expert Result()
        {
            if (count < 50) return null;
            var e = new Expert { Samples = count, Oil = Round(oil.Mean(count), 1), OilMax = Round(oil.Extreme, 1), Water = Round(water.Mean(count), 1), WaterMax = Round(water.Extreme, 1) };
            for (int i = 0; i < 4; i++)
            {
                e.TyreTemp[i] = Round(temp[i].Mean(count), 1); e.TyreTempMax[i] = Round(temp[i].Extreme, 1);
                e.Pressure[i] = Round(kpa[i].Mean(count), 1); e.PressureMax[i] = Round(kpa[i].Extreme, 1);
                e.Spread[i] = Round(spread[i].Mean(count), 1); e.SpreadMin[i] = Round(spread[i].Extreme, 1);
                e.Brake[i] = Round(brake[i].Mean(count), 0); e.BrakeMax[i] = Round(brake[i].Extreme, 0);
                e.Ride[i] = Round(ride[i].Mean(count), 1); e.RideMin[i] = Round(ride[i].Extreme, 1);
                e.TyreLeft[i] = Round(left[i], 1);
            }
            return e;
        }
    }

    public class LiveStop
    {
        [JsonProperty("lap")] public int Lap;
        [JsonProperty("lane")] public double Lane;
        [JsonProperty("stopped")] public double Stationary;
        [JsonProperty("fuel")] public double Fuel;
        [JsonProperty("ve")] public double Energy;
        [JsonProperty("tyres")] public int Tyres;
        [JsonProperty("repair")] public bool Repair;
    }

    public class LiveSession
    {
        [JsonProperty("at")] public long At;
        [JsonProperty("track")] public string Track;
        [JsonProperty("car")] public string Car;
        [JsonProperty("class")] public string Class;
        [JsonProperty("driver")] public string Driver;
        [JsonProperty("session")] public int Session;
        [JsonProperty("capacity")] public double FuelCapacity;
        [JsonProperty("laps")] public List<LiveLap> Laps = new List<LiveLap>();
        [JsonProperty("stops")] public List<LiveStop> Stops = new List<LiveStop>();
        [JsonProperty("service", NullValueHandling = NullValueHandling.Ignore)] public ServiceTimes Service;
        [JsonProperty("game", NullValueHandling = NullValueHandling.Ignore)] public GameForecast Game;
        [JsonProperty("trace", NullValueHandling = NullValueHandling.Ignore)] public LapTrace Trace;
        [JsonProperty("expert", NullValueHandling = NullValueHandling.Ignore)] public Expert Expert;
    }

    // Turns the samples (ten a second) into laps and stops; Done is called with each finished session.
    public class Recorder
    {
        class LapState
        {
            public Sample Start;
            public double Top, TrackSum, WetSum;
            public double[] Temps = new double[4], Brakes = new double[4];
            public int Count, TrackCount;
            public bool Pit;
            public LapTrace Trace = new LapTrace();
        }

        class StopState
        {
            public double Enter, StopStart, StopEnd;
            public Sample Before, After;
            public bool Stopped;
        }

        readonly Func<DateTime> now;
        readonly Action<LiveSession> done;
        LiveSession session;
        ExpertState expert;
        Sample last;
        LapState lap;
        StopState stop;
        int idle;
        bool onTrack; // out of the pit lane at least once in this session

        readonly Func<string> setup;
        readonly Func<double?> light;

        public Recorder(Func<DateTime> now, Action<LiveSession> done, Func<string> setup = null, Func<double?> light = null) { this.now = now; this.done = done; this.setup = setup; this.light = light; }

        public void Flush()
        {
            if (session != null && session.Laps.Count > 0) { session.Expert = expert?.Result(); done(session); }
            session = null; lap = null; stop = null; onTrack = false; expert = null;
        }

        static double Round(double value, int digits) => Math.Round(value, digits, MidpointRounding.AwayFromZero);

        // One sample (ok=false when the game is closed or nobody drives).
        public void Feed(Sample s, bool ok)
        {
            if (!ok || !s.Realtime)
            {
                // Back to the menus for about 2 minutes: the session is over.
                if (++idle > 1200) { Flush(); idle = 0; }
                return;
            }
            idle = 0;
            if (session != null && (s.Session != last.Session || s.Track != last.Track || s.Car != last.Car || s.ET + 5 < last.ET)) Flush();
            if (session == null)
            {
                session = new LiveSession { At = new DateTimeOffset(now()).ToUnixTimeMilliseconds(), Track = s.Track, Car = s.Car, Class = s.Class, Driver = s.Driver, Session = s.Session };
                lap = new LapState { Start = s };
                expert = new ExpertState();
            }
            session.FuelCapacity = s.FuelCapacity;
            if (s.Speed > lap.Top && !s.InPits) lap.Top = s.Speed;
            if (s.InPits) lap.Pit = true;
            else if (s.Speed > 60)
            {
                for (int i = 0; i < 4; i++) { lap.Temps[i] += s.Wheels[i].Temp; lap.Brakes[i] += s.Wheels[i].Brake; }
                lap.Count++;
                expert.Add(s);
            }
            lap.TrackSum += s.TrackTemp;
            if (s.Wet >= 0 && s.Wet <= 1) lap.WetSum += s.Wet;
            lap.TrackCount++;
            PitStop(s);
            if (!s.InPits) onTrack = true;
            // The lap point by point, from its start on the line; a lap through the pits is not kept anyway.
            if (!lap.Pit && lap.Trace.Clock.Count < 12000) lap.Trace.Add(s, s.ET - lap.Start.ET);
            if (s.LapsDone > last.LapsDone && last.Realtime) CloseLap(s);
            last = s;
        }

        void CloseLap(Sample s)
        {
            Sample start = lap.Start;
            var output = new LiveLap
            {
                N = s.LapsDone, Time = Round(s.LastLap, 3), Top = Round(lap.Top, 1), Compound = s.FrontCompound, Rain = Round(s.Rain, 2),
                AirTemp = Round(s.AirTemp, 1), Invalid = s.Invalid, Pit = lap.Pit, Setup = setup?.Invoke(), Light = light?.Invoke()
            };
            // The three sectors, only when the game gave all of them for this lap.
            if (s.LastSector1 > 0 && s.LastSector2 > s.LastSector1 && s.LastLap > s.LastSector2)
            {
                output.S1 = Round(s.LastSector1, 3);
                output.S2 = Round(s.LastSector2 - s.LastSector1, 3);
                output.S3 = Round(s.LastLap - s.LastSector2, 3);
            }
            if (!string.IsNullOrEmpty(s.RearCompound) && s.RearCompound != s.FrontCompound) output.Compound += " / " + s.RearCompound;
            if (lap.TrackCount > 0)
            {
                output.TrackTemp = Round(lap.TrackSum / lap.TrackCount, 1);
                output.Wet = Round(lap.WetSum / lap.TrackCount, 2);
            }
            // Used during the lap; nothing when a stop refilled or changed it.
            if (start.Fuel - s.Fuel > 0 && !lap.Pit) output.Fuel = Round(start.Fuel - s.Fuel, 3);
            if (start.Energy - s.Energy > 0 && !lap.Pit) output.Energy = Round(start.Energy - s.Energy, 3);
            for (int i = 0; i < 4; i++)
            {
                double used = start.Wheels[i].Wear - s.Wheels[i].Wear;
                if (used >= 0 && !lap.Pit) output.Wear[i] = Round(used * 100, 3);
                if (lap.Count > 0)
                {
                    output.Temp[i] = Round(lap.Temps[i] / lap.Count, 1);
                    output.Brake[i] = Round(lap.Brakes[i] / lap.Count, 0);
                }
                output.Pressure[i] = Round(s.Wheels[i].Pressure, 1);
            }
            // LMU sometimes counts a lap on track without a time (-1): kept for its fuel and tyres, without the time.
            if (output.Time > 0 || !lap.Pit)
            {
                output.Time = Math.Max(output.Time, 0);
                session.Laps.Add(output);
            }
            // The session's fastest clean lap keeps its trace: a timed, valid lap away from the pits, started on the line.
            if (output.Time > 0 && !output.Invalid && !lap.Pit && start.LapsDone > 0 && lap.Trace.Clock.Count > 50 && (session.Trace == null || output.Time < session.Trace.Time))
            {
                lap.Trace.N = output.N;
                lap.Trace.Time = output.Time;
                session.Trace = lap.Trace;
            }
            lap = new LapState { Start = s };
        }

        // A stop: from the pit lane entry to its exit, with the time stopped in the box and what changed meanwhile.
        void PitStop(Sample s)
        {
            // Only a lane entered from the track: leaving the garage is not a stop.
            if (s.InPits && stop == null) { if (onTrack) stop = new StopState { Enter = s.ET, Before = s }; }
            else if (s.InPits)
            {
                // Stopped in the box (LMU's pit state is not reliable: 4, not 3, while serviced).
                if (s.Speed < 1)
                {
                    // What changed is counted from the lane entry: the game may serve as soon as the car stops.
                    if (!stop.Stopped) { stop.Stopped = true; stop.StopStart = s.ET; }
                    stop.StopEnd = s.ET; stop.After = s;
                }
            }
            else if (stop != null)
            {
                var finished = stop;
                stop = null;
                if (!finished.Stopped || finished.StopEnd <= finished.StopStart || s.ET - finished.Enter > 600) return;
                var output = new LiveStop
                {
                    Lap = s.LapsDone, Lane = Round(s.ET - finished.Enter, 2), Stationary = Round(finished.StopEnd - finished.StopStart, 2),
                    Fuel = Round(Math.Max(0, finished.After.Fuel - finished.Before.Fuel), 2), Energy = Round(Math.Max(0, finished.After.Energy - finished.Before.Energy), 2),
                    Repair = finished.After.Damage < finished.Before.Damage,
                    Tyres = Enumerable.Range(0, 4).Count(i => finished.After.Wheels[i].Wear > finished.Before.Wheels[i].Wear + 0.01)
                };
                session.Stops.Add(output);
            }
        }
    }
}

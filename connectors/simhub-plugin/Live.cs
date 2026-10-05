// Données en direct : pendant que le pilote roule, LMU publie son état dans la mémoire partagée « LMU_Data ».
// Même lecture que le synchroniseur (connectors/lmu-sync/live.go, dont les offsets viennent de pyLMUSharedMemory) :
// par tour, l'usure et les températures des pneus, la gomme, la vitesse max, le carburant en litres et la
// température de piste ; et chaque arrêt aux stands décomposé. Les deux doivent rester identiques.
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
    }

    public struct Sample
    {
        public double ET;
        public bool Realtime;
        public int Session;
        public string Track, Car, Class;
        public double TrackTemp, AirTemp, Rain;
        public short LapsDone;
        public double LastLap;
        public bool InPits;
        public byte PitState;
        public double Speed, Fuel, FuelCapacity, Energy;
        public int Damage;
        public bool Invalid;
        public byte TrackLimits;
        public string FrontCompound, RearCompound;
        public Wheel[] Wheels;
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

        // The player's car from a copy of the shared memory; false when nobody drives.
        public static bool Read(byte[] b, out Sample s)
        {
            s = default;
            if (b.Length < Size || b[TelemetryOff + 2] == 0) return false;
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
                Track = Text(b, ScoringInfo, 64), Car = Text(b, v + 36, 64), Class = Text(b, v + 200, 32),
                TrackTemp = F64(b, ScoringInfo + 236), AirTemp = F64(b, ScoringInfo + 228), Rain = F64(b, ScoringInfo + 220),
                LapsDone = I16(b, v + 100), LastLap = F64(b, v + 168), InPits = b[v + 198] != 0, PitState = b[v + 457],
                Speed = Math.Sqrt(vx * vx + vy * vy + vz * vz) * 3.6,
                Fuel = F64(b, t + 524), FuelCapacity = F64(b, t + 608), Energy = F32(b, t + 776) * 100,
                Invalid = b[t + 745] != 0, TrackLimits = b[t + 767], FrontCompound = Text(b, t + 620, 18), RearCompound = Text(b, t + 638, 18),
                Wheels = new Wheel[4]
            };
            string model = Text(b, t + 796, 30);
            if (model != "") s.Car = model;
            for (int i = 0; i < 8; i++) s.Damage += b[t + 544 + i];
            for (int i = 0; i < 4; i++)
            {
                int w = t + 848 + i * 260;
                // The tyre's carcass temperature, the one the game shows (the surface swings by 20 °C a corner); kelvin, as the brakes.
                s.Wheels[i] = new Wheel
                {
                    Temp = F64(b, w + 204) - 273.15, Wear = F64(b, w + 152),
                    Pressure = F64(b, w + 120), Brake = F64(b, w + 24) - 273.15
                };
            }
            return true;
        }
    }

    // What is sent for one lap and one stop (percent of the tyre worn, °C, km/h, litres, seconds): the site's format.
    public class LiveLap
    {
        [JsonProperty("n")] public int N;
        [JsonProperty("t")] public double Time;
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
        [JsonProperty("invalid")] public bool Invalid;
        [JsonProperty("pit")] public bool Pit;
        [JsonProperty("limits")] public int TrackLimits;
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
        [JsonProperty("session")] public int Session;
        [JsonProperty("capacity")] public double FuelCapacity;
        [JsonProperty("laps")] public List<LiveLap> Laps = new List<LiveLap>();
        [JsonProperty("stops")] public List<LiveStop> Stops = new List<LiveStop>();
    }

    // Turns the samples (ten a second) into laps and stops; Done is called with each finished session.
    public class Recorder
    {
        class LapState
        {
            public Sample Start;
            public double Top, TrackSum;
            public double[] Temps = new double[4], Brakes = new double[4];
            public int Count, TrackCount;
            public bool Pit;
            public byte Limits;
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
        Sample last;
        LapState lap;
        StopState stop;
        int idle;
        bool onTrack; // out of the pit lane at least once in this session

        public Recorder(Func<DateTime> now, Action<LiveSession> done) { this.now = now; this.done = done; }

        public void Flush()
        {
            if (session != null && session.Laps.Count > 0) done(session);
            session = null; lap = null; stop = null; onTrack = false;
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
                session = new LiveSession { At = new DateTimeOffset(now()).ToUnixTimeMilliseconds(), Track = s.Track, Car = s.Car, Class = s.Class, Session = s.Session };
                lap = new LapState { Start = s };
            }
            session.FuelCapacity = s.FuelCapacity;
            if (s.Speed > lap.Top && !s.InPits) lap.Top = s.Speed;
            if (s.InPits) lap.Pit = true;
            else if (s.Speed > 60)
            {
                for (int i = 0; i < 4; i++) { lap.Temps[i] += s.Wheels[i].Temp; lap.Brakes[i] += s.Wheels[i].Brake; }
                lap.Count++;
            }
            lap.TrackSum += s.TrackTemp;
            lap.TrackCount++;
            if (s.TrackLimits > lap.Limits) lap.Limits = s.TrackLimits;
            PitStop(s);
            if (!s.InPits) onTrack = true;
            if (s.LapsDone > last.LapsDone && last.Realtime) CloseLap(s);
            last = s;
        }

        void CloseLap(Sample s)
        {
            Sample start = lap.Start;
            var output = new LiveLap
            {
                N = s.LapsDone, Time = Round(s.LastLap, 3), Top = Round(lap.Top, 1), Compound = s.FrontCompound, Rain = Round(s.Rain, 2),
                AirTemp = Round(s.AirTemp, 1), Invalid = s.Invalid, Pit = lap.Pit, TrackLimits = lap.Limits
            };
            if (!string.IsNullOrEmpty(s.RearCompound) && s.RearCompound != s.FrontCompound) output.Compound += " / " + s.RearCompound;
            if (lap.TrackCount > 0) output.TrackTemp = Round(lap.TrackSum / lap.TrackCount, 1);
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
            if (output.Time > 0) session.Laps.Add(output);
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

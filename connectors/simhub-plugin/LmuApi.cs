// Ce que LMU dit de la voiture dans son API locale (http://localhost:6397, en lecture seule) : ses temps de service,
// les mêmes pour tous ceux qui la conduisent, sa prévision pour un tour, le nom du réglage chargé et la lumière du jour
// (jour ou nuit). Envoyés avec chaque séance ;
// le site les lit dans cleanService / cleanGame (shared/combos.mjs). Rien ici ne modifie le jeu.
using System;
using System.Linq;
using System.Net.Http;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace EnduranceManager.SimHub
{
    // Seconds, litres per second and percent of energy per second, as the game's own table (pitStopTimes). The
    // "…Along" flags are the game's "…Concurrent": 1 when the job runs during the refuelling, 0 when it comes after.
    public class ServiceTimes
    {
        [JsonProperty("fuelRate")] public double? FuelRate;
        [JsonProperty("energyRate")] public double? EnergyRate;
        [JsonProperty("connect")] public double? Connect;
        [JsonProperty("tyres4")] public double? Tyres4;
        [JsonProperty("tyres2")] public double? Tyres2;
        [JsonProperty("wing")] public double? Wing;
        [JsonProperty("brakes")] public double? Brakes;
        [JsonProperty("driver")] public double? Driver;
        [JsonProperty("wingNew")] public double? WingNew;
        [JsonProperty("frontWing")] public double? FrontWing;
        [JsonProperty("frontWingNew")] public double? FrontWingNew;
        [JsonProperty("repair")] public double? Repair;
        [JsonProperty("aeroRepair")] public double? AeroRepair;
        [JsonProperty("pressure")] public double? Pressure;
        [JsonProperty("radiator")] public double? Radiator;
        [JsonProperty("tyresAlong")] public double? TyresAlong;
        [JsonProperty("brakesAlong")] public double? BrakesAlong;
        [JsonProperty("driverAlong")] public double? DriverAlong;
        [JsonProperty("repairAlong")] public double? RepairAlong;
        [JsonProperty("fuelRandom")] public double? FuelRandom;
        [JsonProperty("tyresRandom")] public double? TyresRandom;
        [JsonProperty("driverRandom")] public double? DriverRandom;
        [JsonProperty("repairRandom")] public double? RepairRandom;
    }

    // The game's forecast for one lap (litres, percent of energy) and the ideal temperature of the compound (°C).
    public class GameForecast
    {
        [JsonProperty("fuel")] public double? Fuel;
        [JsonProperty("ve")] public double? Energy;
        [JsonProperty("ideal")] public double? Ideal;
    }

    public class LmuApi
    {
        const string Root = "http://localhost:6397/rest/";
        readonly HttpClient client = new HttpClient { Timeout = TimeSpan.FromSeconds(3) };

        public ServiceTimes Service { get; private set; }
        public GameForecast Game { get; private set; }
        // The setup loaded in the garage (garage › summary › activeSetup), as the pilot named it.
        public string Setup { get; private set; }
        // Daylight from the game's weather (currentWeather › lightLevel: 0 at night, 1 in full day), and when it was read.
        public double? Light { get; private set; }
        public DateTime LightAt { get; private set; }
        public DateTime? ReadAt { get; private set; }
        // The whole pit screen last read (fuelInfo, wearables, currentWeather, teamInfo…), for the race figures (Course.cs).
        public volatile JObject Refuel;
        // One read at a time: a slow answer never piles up calls to the game.
        public bool Busy => busy != 0;
        int busy;

        JObject Get(string path)
        {
            try { return JObject.Parse(client.GetStringAsync(Root + path).GetAwaiter().GetResult()); }
            catch { return null; }
        }

        static double? Number(JToken token) => token != null && token.Type != JTokenType.Null && double.TryParse(token.ToString(), System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var value) ? value : (double?)null;

        // One read of the setup and, with the car in the pits, of the two screens; what is missing keeps its last value.
        // Never throws: it runs on a pool thread, where an error would close SimHub.
        public void Read(string compound, bool setupOnly = false)
        {
            if (System.Threading.Interlocked.Exchange(ref busy, 1) == 1) return;
            try
            {
                ReadSetup();
                if (!setupOnly) ReadScreens(compound);
            }
            catch { }
            finally { busy = 0; }
        }

        // Only the daylight, read while driving (every minute) so night laps are told from day laps. The game gives it
        // on the pit screen (currentWeather › lightLevel, about 15 KB), not in the smaller game state.
        public void ReadLight()
        {
            if (System.Threading.Interlocked.Exchange(ref busy, 1) == 1) return;
            try { TakeLight(Get("garage/UIScreen/RepairAndRefuel")); }
            catch { }
            finally { busy = 0; }
        }

        bool TakeLight(JObject answer)
        {
            if (answer != null) Refuel = answer;
            double? light = Number(answer?.SelectToken("$..lightLevel"));
            if (light == null || light < 0 || light > 1) return false;
            Light = light;
            LightAt = DateTime.Now;
            return true;
        }

        // The daylight for a lap ending now: the last reading, when it is recent enough to tell day from night.
        public double? CurrentLight() => Light.HasValue && DateTime.Now - LightAt < TimeSpan.FromMinutes(3) ? Light : null;

        void ReadSetup()
        {
            var name = Get("garage/summary")?["activeSetup"];
            if (name != null && name.Type == JTokenType.String && ((string)name).Trim() != "") Setup = ((string)name).Trim();
        }

        void ReadScreens(string compound)
        {
            var refuel = Get("garage/UIScreen/RepairAndRefuel");
            TakeLight(refuel);
            var times = refuel?["pitStopTimes"]?["times"];
            if (times != null)
            {
                double? insert = Number(times["FuelInsert"]), remove = Number(times["FuelRemove"]), energy = Number(times["virtualEnergyFillRate"]);
                Service = new ServiceTimes
                {
                    FuelRate = Number(times["FuelFillRate"]), EnergyRate = energy > 0 ? energy * 100 : null,
                    Connect = insert.HasValue || remove.HasValue ? (insert ?? 0) + (remove ?? 0) : (double?)null,
                    Tyres4 = Number(times["FourTireChange"]), Tyres2 = Number(times["TwoTireChange"]), Wing = Number(times["RearWingAdjust"]),
                    Brakes = Number(times["BrakeChange"]), Driver = Number(times["DriverChange"]),
                    WingNew = Number(times["RearWingReplace"]), FrontWing = Number(times["FrontWingAdjust"]), FrontWingNew = Number(times["FrontWingReplace"]),
                    Repair = Number(times["FixAllDamage"]), AeroRepair = Number(times["FixAeroDamage"]), Pressure = Number(times["PressureChange"]),
                    Radiator = Number(times["RadiatorChange"]), TyresAlong = Number(times["TireTimeConcurrent"]), BrakesAlong = Number(times["BrakeTimeConcurrent"]),
                    DriverAlong = Number(times["DriverConcurrent"]), RepairAlong = Number(times["FixTimeConcurrent"]), FuelRandom = Number(times["FuelRandomDelay"]),
                    TyresRandom = Number(times["RandomTireDelay"]), DriverRandom = Number(times["DriverRandom"]), RepairRandom = Number(times["FixRandomDelay"])
                };
                ReadAt = DateTime.Now;
            }
            var tyres = Get("garage/UIScreen/TireManagement");
            var usage = tyres?["expectedUsage"];
            if (usage != null)
            {
                var ideal = (tyres["optimalCompoundConditions"]?["compounds"] as JArray)?
                    .FirstOrDefault(item => string.Equals((string)item["type"], compound, StringComparison.OrdinalIgnoreCase));
                double? fraction = Number(usage["virtualEnergyFractionPerLap"]);
                Game = new GameForecast { Fuel = Number(usage["fuelConsumption"]), Energy = fraction > 0 ? fraction * 100 : null, Ideal = Number(ideal?["optimalTemperature"]) };
            }
        }
    }
}

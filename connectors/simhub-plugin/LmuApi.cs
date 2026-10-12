// Ce que LMU dit de la voiture dans son API locale (http://localhost:6397, en lecture seule) : ses temps de service,
// les mêmes pour tous ceux qui la conduisent, et sa prévision pour un tour. Envoyés avec chaque séance en direct ;
// le site les lit dans cleanService / cleanGame (shared/training.mjs). Rien ici ne modifie le jeu.
using System;
using System.Linq;
using System.Net.Http;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace EnduranceManager.SimHub
{
    // Seconds, litres per second and percent of energy per second, as the game's own table (pitStopTimes).
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
        const string Root = "http://localhost:6397/rest/garage/UIScreen/";
        readonly HttpClient client = new HttpClient { Timeout = TimeSpan.FromSeconds(3) };

        public ServiceTimes Service { get; private set; }
        public GameForecast Game { get; private set; }
        public DateTime? ReadAt { get; private set; }

        JObject Get(string screen)
        {
            try { return JObject.Parse(client.GetStringAsync(Root + screen).GetAwaiter().GetResult()); }
            catch { return null; }
        }

        static double? Number(JToken token) => token != null && token.Type != JTokenType.Null && double.TryParse(token.ToString(), System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var value) ? value : (double?)null;

        // One read of the two screens; what is missing keeps its last value.
        public void Read(string compound)
        {
            var refuel = Get("RepairAndRefuel");
            var times = refuel?["pitStopTimes"]?["times"];
            if (times != null)
            {
                double? insert = Number(times["FuelInsert"]), remove = Number(times["FuelRemove"]), energy = Number(times["virtualEnergyFillRate"]);
                Service = new ServiceTimes
                {
                    FuelRate = Number(times["FuelFillRate"]), EnergyRate = energy > 0 ? energy * 100 : null,
                    Connect = insert.HasValue || remove.HasValue ? (insert ?? 0) + (remove ?? 0) : (double?)null,
                    Tyres4 = Number(times["FourTireChange"]), Tyres2 = Number(times["TwoTireChange"]), Wing = Number(times["RearWingAdjust"]),
                    Brakes = Number(times["BrakeChange"]), Driver = Number(times["DriverChange"])
                };
                ReadAt = DateTime.Now;
            }
            var tyres = Get("TireManagement");
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

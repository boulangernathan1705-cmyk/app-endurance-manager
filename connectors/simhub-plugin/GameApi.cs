// Ce que l'API locale de LMU (http://localhost:6397, en lecture seule) dit en roulant, pour les chiffres de course
// (Course.cs) : état du jeu et des stands, estimation de l'arrêt par le jeu, état de la voiture, infos de la séance ; et
// une fois par séance la météo prévue, les réglages de la séance, la voiture, le circuit et les pneus. Les réponses
// gardées telles quelles : Course.cs y lit ce qu'il publie. Rien ici ne modifie le jeu.
using System;
using System.Net.Http;
using Newtonsoft.Json.Linq;

namespace EnduranceManager.SimHub
{
    public class GameApi
    {
        const string Root = "http://localhost:6397/";
        readonly HttpClient client = new HttpClient { Timeout = TimeSpan.FromSeconds(3) };
        int busy;
        DateTime stateAt, conditionAt, infoAt, staticAt;
        string sessionKey;

        // Every 2 s: game state (pit state, closest weather node…) and the game's estimate of the stop as set.
        public volatile JObject State, Estimate;
        // Every 5 s: car condition and session info (clock, wetness, session name).
        public volatile JObject Condition, Info;
        // Once per session: forecast, session settings, car and track, tyres (optimal temperatures, inventory).
        public volatile JObject Weather, Settings, Loading, Tyres;

        public bool Busy => busy != 0;

        JObject Get(string path)
        {
            try { return JObject.Parse(client.GetStringAsync(Root + path).GetAwaiter().GetResult()); }
            catch { return null; }
        }

        // Once a second while driving: what is due, one read after the other. Never throws: it runs on a pool thread.
        public void Read()
        {
            if (System.Threading.Interlocked.Exchange(ref busy, 1) == 1) return;
            try
            {
                var now = DateTime.Now;
                if (now - stateAt >= TimeSpan.FromSeconds(2))
                {
                    stateAt = now;
                    State = Get("rest/sessions/GetGameState") ?? State;
                    Estimate = Get("rest/strategy/pitstop-estimate") ?? Estimate;
                }
                if (now - conditionAt >= TimeSpan.FromSeconds(5))
                {
                    conditionAt = now;
                    Condition = Get("rest/garage/getVehicleCondition") ?? Condition;
                }
                if (now - infoAt >= TimeSpan.FromSeconds(5))
                {
                    infoAt = now;
                    var info = Get("rest/watch/sessionInfo");
                    if (info != null) Info = info;
                }
                // A new session, or what failed, again 30 s later: the answers that do not change during it.
                string key = Info != null ? (string)Info["session"] + "|" + (string)Info["trackName"] : null;
                bool missing = Weather == null || Settings == null || Loading == null || Tyres == null;
                if (key != null && (key != sessionKey || (missing && now - staticAt >= TimeSpan.FromSeconds(30))))
                {
                    if (key != sessionKey) Weather = Settings = Loading = Tyres = null;
                    sessionKey = key;
                    staticAt = now;
                    Weather = Weather ?? Get("rest/sessions/weather");
                    Settings = Settings ?? Get("rest/sessions");
                    Loading = Loading ?? Get("navigation/GetLoadingScreen");
                    Tyres = Tyres ?? Get("rest/garage/UIScreen/TireManagement");
                }
            }
            catch { }
            finally { busy = 0; }
        }
    }
}

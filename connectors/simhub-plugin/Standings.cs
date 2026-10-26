// Le classement en direct du jeu (WebSocket ws://localhost:6398/websocket/ui, sujet « LiveStandings »), pour ce que
// la mémoire partagée ne donne pas : pénalités du pilote par type (DT, SG, TIME) et statut d'arrivée (DNF, DQ…). Lu
// sur son propre fil, seulement quand le jeu tourne ; le jeu envoie tout le plateau plusieurs fois par seconde, seule
// une réponse toutes les 2 s est lue. Rien ici ne modifie le jeu.
using System;
using System.IO;
using System.Linq;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using Newtonsoft.Json.Linq;

namespace EnduranceManager.SimHub
{
    public class Standings
    {
        const string Url = "ws://localhost:6398/websocket/ui";
        const string Subscribe = "{\"messageType\":\"SUB\",\"topic\":\"LiveStandings\"}";
        readonly Func<bool> active;
        readonly string sample;
        Thread thread;
        volatile bool running;

        // The player's line, as the game last sent it, replaced whole.
        public class Line
        {
            public string FinishStatus, VehicleName;
            public int? DT, SG, Time;
        }
        public volatile Line Player;

        // active: the game is running and the plugin is on. sample: where the first answer is kept, to know its format.
        public Standings(Func<bool> active, string sample)
        {
            this.active = active;
            this.sample = sample;
        }

        public void Start()
        {
            running = true;
            thread = new Thread(Loop) { IsBackground = true, Name = "EnduranceManager.Standings", Priority = ThreadPriority.BelowNormal };
            thread.Start();
        }

        public void Stop() => running = false;

        void Loop()
        {
            int wait = 5;
            while (running)
            {
                if (!active()) { Clear(); Sleep(5); continue; }
                try
                {
                    Listen();
                    wait = 5;
                }
                catch { }
                // The game closed or not ready yet: again a little later, less and less often.
                Sleep(wait);
                wait = Math.Min(60, wait * 2);
            }
        }

        void Sleep(int seconds) { for (int i = 0; running && i < seconds * 10; i++) Thread.Sleep(100); }

        void Clear() => Player = null;

        void Listen()
        {
            using (var socket = new ClientWebSocket())
            {
                var none = CancellationToken.None;
                if (!socket.ConnectAsync(new Uri(Url), none).Wait(5000)) return;
                var message = Encoding.UTF8.GetBytes(Subscribe);
                socket.SendAsync(new ArraySegment<byte>(message), WebSocketMessageType.Text, true, none).Wait(5000);
                var buffer = new byte[65536];
                var whole = new MemoryStream();
                DateTime readAt = DateTime.MinValue;
                while (running && active() && socket.State == WebSocketState.Open)
                {
                    var receive = socket.ReceiveAsync(new ArraySegment<byte>(buffer), none);
                    // Nothing for 10 s: the game stopped answering, connect again.
                    if (!receive.Wait(10000)) { socket.Abort(); return; }
                    var result = receive.Result;
                    if (result.MessageType == WebSocketMessageType.Close) return;
                    // Only one answer every 2 s is kept: the others are let go without reading them.
                    bool keep = DateTime.Now - readAt >= TimeSpan.FromSeconds(2);
                    if (keep) whole.Write(buffer, 0, result.Count);
                    if (!result.EndOfMessage) continue;
                    if (keep && whole.Length > 0)
                    {
                        readAt = DateTime.Now;
                        Read(Encoding.UTF8.GetString(whole.GetBuffer(), 0, (int)whole.Length));
                    }
                    whole.SetLength(0);
                }
            }
        }

        void Read(string text)
        {
            try
            {
                if (sample != null && !File.Exists(sample)) File.WriteAllText(sample, text);
            }
            catch { }
            var me = (JObject.Parse(text)["body"] as JArray)?.OfType<JObject>().FirstOrDefault(car => (bool?)car["player"] == true);
            if (me == null) return;
            Player = new Line
            {
                FinishStatus = (string)me["finishStatus"], VehicleName = (string)me["vehicleName"],
                DT = (int?)me["penalties"]?["DT"], SG = (int?)me["penalties"]?["SG"], Time = (int?)me["penalties"]?["TIME"]
            };
        }
    }
}

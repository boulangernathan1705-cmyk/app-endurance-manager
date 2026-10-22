using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using GameReaderCommon;
using Newtonsoft.Json;

namespace LmuEndurancePrep
{
    /// <summary>
    /// Step 0 of the MVP: writes one full snapshot of everything SimHub exposes for LMU
    /// (normalized data + raw game data) at the start of a session and at every lap crossing.
    /// The resulting JSON Lines files tell us which fields really exist before we build the recorder.
    /// </summary>
    public class ReconRecorder
    {
        private const int MaxDepth = 5;
        private const int MaxListItems = 128;

        private readonly string outputFolder;
        private readonly object writeLock = new object();
        private string sessionKey;
        private int lastLap = -1;
        private int lapsLogged;

        public ReconRecorder(string outputFolder)
        {
            this.outputFolder = outputFolder;
        }

        public string OutputFolder => outputFolder;

        public int LapsLogged => lapsLogged;

        public string CurrentFile { get; private set; } = "";

        public string LastError { get; private set; } = "";

        public void OnFrame(string gameName, StatusDataBase oldData, StatusDataBase newData)
        {
            var key = $"{newData.TrackName}|{newData.CarModel}|{newData.SessionTypeName}";
            if (key != sessionKey)
            {
                sessionKey = key;
                lastLap = newData.CurrentLap;
                CurrentFile = Path.Combine(outputFolder, BuildFileName(newData));
                Capture("session_start", gameName, newData);
                return;
            }

            if (newData.CurrentLap != lastLap)
            {
                lastLap = newData.CurrentLap;
                Capture("lap_crossed", gameName, newData);
            }
        }

        public void Flush()
        {
            // Writes are synchronous inside the lock; waiting for the lock is enough.
            lock (writeLock) { }
        }

        private void Capture(string trigger, string gameName, StatusDataBase data)
        {
            Dictionary<string, object> snapshot;
            try
            {
                // Read the live objects on the SimHub thread, serialize and write elsewhere.
                snapshot = new Dictionary<string, object>
                {
                    ["capturedAtUtc"] = DateTime.UtcNow.ToString("o"),
                    ["trigger"] = trigger,
                    ["game"] = gameName,
                    ["currentLap"] = data.CurrentLap,
                    ["normalized"] = Describe(data, 0, new HashSet<object>()),
                    ["raw"] = Describe(SafeRaw(data), 0, new HashSet<object>()),
                };
            }
            catch (Exception ex)
            {
                LastError = ex.Message;
                return;
            }

            var file = CurrentFile;
            Task.Run(() =>
            {
                try
                {
                    var line = JsonConvert.SerializeObject(snapshot, Formatting.None);
                    lock (writeLock)
                    {
                        Directory.CreateDirectory(outputFolder);
                        File.AppendAllText(file, line + Environment.NewLine, Encoding.UTF8);
                    }
                    Interlocked.Increment(ref lapsLogged);
                }
                catch (Exception ex)
                {
                    LastError = ex.Message;
                }
            });
        }

        private static object SafeRaw(StatusDataBase data)
        {
            try
            {
                return data.GetRawDataObject();
            }
            catch
            {
                return null;
            }
        }

        private static object Describe(object value, int depth, HashSet<object> visited)
        {
            if (value == null)
            {
                return null;
            }

            var type = value.GetType();
            if (type.IsPrimitive || value is string || value is decimal)
            {
                return value;
            }
            if (type.IsEnum)
            {
                return value.ToString();
            }
            if (value is DateTime dateTime)
            {
                return dateTime.ToString("o");
            }
            if (value is TimeSpan timeSpan)
            {
                return timeSpan.TotalSeconds;
            }
            if (value is byte[] bytes)
            {
                // rFactor 2 style shared memory stores names as fixed-size byte buffers.
                return Encoding.UTF8.GetString(bytes).TrimEnd('\0');
            }
            if (depth >= MaxDepth)
            {
                return "<max depth>";
            }
            if (!type.IsValueType)
            {
                if (visited.Contains(value))
                {
                    return "<cycle>";
                }
                visited.Add(value);
            }

            if (value is IEnumerable sequence)
            {
                var items = new List<object>();
                foreach (var item in sequence)
                {
                    if (items.Count >= MaxListItems)
                    {
                        items.Add("<truncated>");
                        break;
                    }
                    items.Add(Describe(item, depth + 1, visited));
                }
                return items;
            }

            var members = new Dictionary<string, object>();
            const BindingFlags flags = BindingFlags.Public | BindingFlags.Instance;
            foreach (var field in type.GetFields(flags))
            {
                members[field.Name] = Read(() => field.GetValue(value), depth, visited);
            }
            foreach (var property in type.GetProperties(flags).Where(p => p.CanRead && p.GetIndexParameters().Length == 0))
            {
                members[property.Name] = Read(() => property.GetValue(value), depth, visited);
            }
            return members;
        }

        private static object Read(Func<object> getter, int depth, HashSet<object> visited)
        {
            try
            {
                return Describe(getter(), depth + 1, visited);
            }
            catch (Exception ex)
            {
                return "<error: " + ex.GetType().Name + ">";
            }
        }

        private static string BuildFileName(StatusDataBase data)
        {
            var name = $"{DateTime.Now:yyyy-MM-dd_HHmm}_{data.TrackName}_{data.CarModel}_{data.SessionTypeName}.jsonl";
            foreach (var invalid in Path.GetInvalidFileNameChars())
            {
                name = name.Replace(invalid, '-');
            }
            return name.Replace(' ', '-');
        }
    }
}

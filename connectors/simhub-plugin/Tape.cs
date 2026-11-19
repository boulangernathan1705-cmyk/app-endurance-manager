// Enregistreur de séance (plugin 2.6) : tout ce que le plugin lit pendant que le pilote roule, pour rejouer la séance
// dans les tests sans le jeu (tests/Replay) : la mémoire de LMU dix fois par seconde, les réponses de l'API locale du
// jeu (localhost:6397) et les messages du salon du mur. Un fichier .emrec par enregistrement, dans
// Documents\Endurance Manager\Enregistrements, rien n'est envoyé.
//
// Format : « EMREC1\n » puis un flux gzip d'enregistrements [genre 1 octet][temps en s depuis le début, double]
// [longueur int32][contenu]. Genres : 0 en-tête JSON, 1 mémoire (les plages changées depuis la précédente :
// [début int32][longueur int32][octets XOR la précédente]), 2 réponse HTTP (« url\n » + corps), 3 message du salon.
//
// En rejeu, Tape.Get rend la dernière réponse enregistrée pour cette adresse et Tape.Now l'heure de l'enregistrement :
// le code du plugin ne change pas entre le jeu et les tests.
using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Net.Http;
using System.Text;

namespace EnduranceManager.SimHub
{
    public static class Tape
    {
        public const string Magic = "EMREC1\n";
        public const byte Header = 0, Memory = 1, Http = 2, Room = 3;
        // An hour and a half at most, or 1.5 GB: a switch left on never fills the disk.
        const double MaxSeconds = 5400;
        const long MaxBytes = 1536L * 1024 * 1024;

        static readonly object gate = new object();
        static FileStream file;
        static GZipStream zip;
        static BinaryWriter writer;
        static byte[] previous;
        static DateTime startedAt;

        public static string Path { get; private set; }
        public static bool Recording => writer != null;
        public static int Frames { get; private set; }

        // ---------- Replay (tests) ----------

        // Set by the tests: the recording's clock and its HTTP answers, in place of the real ones.
        public static Func<DateTime> Clock;
        public static Func<string, string> Answer;
        public static DateTime Now => Clock?.Invoke() ?? DateTime.Now;
        public static long NowMs => new DateTimeOffset(Now).ToUnixTimeMilliseconds();

        // A GET to the game's local API (or any address): the answer is kept while recording, and given back from the
        // recording in the tests (null there when the recording has none: the caller's catch handles it as offline).
        public static string Get(HttpClient client, string url)
        {
            if (Answer != null) return Answer(url) ?? throw new HttpRequestException("Pas de réponse enregistrée pour " + url);
            string body = client.GetStringAsync(url).GetAwaiter().GetResult();
            if (Recording) Write(Http, Encoding.UTF8.GetBytes(url + "\n" + body));
            return body;
        }

        // ---------- Recording (plugin) ----------

        public static string Folder => System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), "Endurance Manager", "Enregistrements");

        public static void Start(string version)
        {
            lock (gate)
            {
                if (Recording) return;
                Directory.CreateDirectory(Folder);
                Path = System.IO.Path.Combine(Folder, DateTime.Now.ToString("yyyy-MM-dd HH-mm-ss") + ".emrec");
                file = new FileStream(Path, FileMode.CreateNew, FileAccess.Write, FileShare.Read);
                var magic = Encoding.ASCII.GetBytes(Magic);
                file.Write(magic, 0, magic.Length);
                zip = new GZipStream(file, CompressionLevel.Fastest);
                writer = new BinaryWriter(new BufferedStream(zip, 1 << 16));
                previous = null;
                Frames = 0;
                startedAt = DateTime.Now;
                string header = "{\"format\":1,\"plugin\":\"" + version + "\",\"started\":\"" + startedAt.ToString("o") + "\",\"memory\":" + LmuMemory.Size + "}";
                WriteLocked(Header, Encoding.UTF8.GetBytes(header));
            }
        }

        public static void Stop()
        {
            lock (gate)
            {
                if (!Recording) return;
                try { writer.Flush(); writer.Dispose(); } catch { }
                writer = null; zip = null; file = null; previous = null;
            }
        }

        public static string Status
        {
            get
            {
                if (!Recording) return Path == null ? "" : "Dernier enregistrement : " + Path;
                long size = 0;
                try { size = new FileInfo(Path).Length; } catch { }
                return $"Enregistrement en cours : {(DateTime.Now - startedAt).TotalMinutes:0} min, {size / 1048576.0:0} Mo · {Path}";
            }
        }

        // One copy of the game's memory (the reading thread, ten times a second): only the bytes that changed.
        public static void Frame(byte[] buffer)
        {
            if (!Recording) return;
            lock (gate)
            {
                if (!Recording) return;
                byte[] runs = Delta(previous, buffer);
                previous = (byte[])buffer.Clone();
                WriteLocked(Memory, runs);
                Frames++;
            }
        }

        // The bytes that changed since the copy before (all of them for the first): runs [start][length][XOR bytes],
        // merged across gaps of fewer than 8 equal bytes (a run's header is 8 bytes).
        public static byte[] Delta(byte[] before, byte[] buffer)
        {
            before = before ?? new byte[buffer.Length];
            var runs = new MemoryStream();
            var w = new BinaryWriter(runs);
            int n = Math.Min(buffer.Length, before.Length);
            for (int i = 0; i < n;)
            {
                if (buffer[i] == before[i]) { i++; continue; }
                int start = i, end = i + 1, same = 0;
                for (int k = i + 1; k < n && same < 8; k++)
                {
                    if (buffer[k] == before[k]) same++;
                    else { same = 0; end = k + 1; }
                }
                w.Write(start);
                w.Write(end - start);
                for (int k = start; k < end; k++) w.Write((byte)(buffer[k] ^ before[k]));
                i = end;
            }
            return runs.ToArray();
        }

        // A message from the team's room (the mur in SimHub).
        public static void RoomMessage(string text)
        {
            if (Recording) Write(Room, Encoding.UTF8.GetBytes(text));
        }

        static void Write(byte kind, byte[] payload)
        {
            lock (gate) { if (Recording) WriteLocked(kind, payload); }
        }

        static void WriteLocked(byte kind, byte[] payload)
        {
            try
            {
                double t = (DateTime.Now - startedAt).TotalSeconds;
                writer.Write(kind);
                writer.Write(t);
                writer.Write(payload.Length);
                writer.Write(payload);
                if (t > MaxSeconds || file.Length > MaxBytes) { writer.Flush(); writer.Dispose(); writer = null; zip = null; file = null; previous = null; }
            }
            // A full disk or a removed folder: the recording stops, the plugin carries on.
            catch { writer = null; zip = null; file = null; previous = null; }
        }

        // ---------- Reading a recording (tests) ----------

        public class Record
        {
            public byte Kind;
            public double Time;
            public byte[] Payload;
            public string Text => Encoding.UTF8.GetString(Payload);
        }

        public static IEnumerable<Record> Read(string path)
        {
            using (var input = File.OpenRead(path))
            {
                var magic = new byte[Magic.Length];
                if (input.Read(magic, 0, magic.Length) != magic.Length || Encoding.ASCII.GetString(magic) != Magic) throw new InvalidDataException(path + " n'est pas un enregistrement");
                using (var gz = new GZipStream(input, CompressionMode.Decompress))
                using (var reader = new BinaryReader(gz))
                {
                    while (true)
                    {
                        byte kind;
                        try { kind = reader.ReadByte(); } catch (EndOfStreamException) { yield break; }
                        Record record;
                        try { record = new Record { Kind = kind, Time = reader.ReadDouble(), Payload = reader.ReadBytes(reader.ReadInt32()) }; }
                        // A recording cut short (SimHub killed): what was written is kept.
                        catch (EndOfStreamException) { yield break; }
                        catch (InvalidDataException) { yield break; }
                        yield return record;
                    }
                }
            }
        }

        // A memory record applied to the previous copy (the copy changes in place).
        public static void Apply(byte[] buffer, byte[] runs)
        {
            int at = 0;
            while (at + 8 <= runs.Length)
            {
                int start = BitConverter.ToInt32(runs, at), length = BitConverter.ToInt32(runs, at + 4);
                at += 8;
                for (int k = 0; k < length; k++) buffer[start + k] ^= runs[at + k];
                at += length;
            }
        }

        // A recording written from code (the tests' synthetic sessions), with its own clock.
        public class Writer : IDisposable
        {
            readonly BinaryWriter w;
            byte[] before;

            public Writer(string path, string header)
            {
                var stream = File.Create(path);
                var magic = Encoding.ASCII.GetBytes(Magic);
                stream.Write(magic, 0, magic.Length);
                w = new BinaryWriter(new GZipStream(stream, CompressionLevel.Optimal));
                Add(Header, 0, Encoding.UTF8.GetBytes(header));
            }

            public void Add(byte kind, double time, byte[] payload) { w.Write(kind); w.Write(time); w.Write(payload.Length); w.Write(payload); }

            public void Frame(double time, byte[] buffer)
            {
                byte[] runs = Delta(before, buffer);
                before = (byte[])buffer.Clone();
                Add(Memory, time, runs);
            }

            public void Dispose() => w.Dispose();
        }
    }
}

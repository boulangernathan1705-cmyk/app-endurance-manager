// Module FMT companion : le plugin FMT companion de Nathan (0.5, FMTCompanion.dll), tel quel, porté par ce plugin.
// Sa DLL est rangée à part (dossier EnduranceManager de SimHub, que SimHub ne charge pas tout seul) et lancée d'ici quand
// le module est activé : SimHub ne voit qu'un plugin, FMT companion garde tout ce qu'il fait, ses réglages, ses rôles du
// Control Mapper et ses propriétés (même nom de classe, donc mêmes noms pour SimHub). Rien n'est réécrit : c'est sa DLL qui
// tourne. Activé ou coupé, le changement prend effet au prochain lancement de SimHub.
using System;
using System.IO;
using System.Linq;
using System.Reflection;
using GameReaderCommon;
using SimHub.Plugins;

namespace EnduranceManager.SimHub
{
    public class Companion
    {
        public const string FileName = "FMTCompanion.dll";
        IPlugin plugin;

        // Where the DLL is kept: SimHub\EnduranceManager\FMTCompanion.dll (put there by the installer).
        public static string Folder => Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "EnduranceManager");
        public static string Kept => Path.Combine(Folder, FileName);
        // The old way: FMT companion as its own plugin in SimHub's folder. Both at once would run it twice.
        public static string Alone => Path.Combine(AppDomain.CurrentDomain.BaseDirectory, FileName);

        public string Status { get; private set; } = "Module coupé.";
        public bool Running => plugin != null;

        public void Start(PluginManager manager)
        {
            try
            {
                if (File.Exists(Alone)) { Status = "FMT companion est encore installé seul dans SimHub : relance l'installeur du plugin, il le range ici."; return; }
                if (!File.Exists(Kept)) { Status = "FMTCompanion.dll manque dans " + Folder + " : relance l'installeur du plugin."; return; }
                var assembly = Assembly.LoadFrom(Kept);
                var type = Loadable(assembly).FirstOrDefault(t => typeof(IPlugin).IsAssignableFrom(t) && !t.IsAbstract && t.GetConstructor(Type.EmptyTypes) != null);
                if (type == null) { Status = "Aucun plugin SimHub trouvé dans FMTCompanion.dll."; return; }
                var instance = (IPlugin)Activator.CreateInstance(type);
                instance.PluginManager = manager;
                instance.Init(manager);
                plugin = instance;
                Status = "FMT companion " + (assembly.GetName().Version?.ToString(3) ?? "") + " lancé.";
            }
            catch (Exception e)
            {
                plugin = null;
                Status = "FMT companion n'a pas pu démarrer : " + (e.InnerException ?? e).Message;
            }
        }

        static Type[] Loadable(Assembly assembly)
        {
            try { return assembly.GetTypes(); }
            catch (ReflectionTypeLoadException e) { return e.Types.Where(t => t != null).ToArray(); }
        }

        // SimHub's sixty updates a second, passed on as SimHub would.
        public void DataUpdate(PluginManager manager, ref GameData data)
        {
            if (plugin is IDataPlugin data2)
                try { data2.DataUpdate(manager, ref data); } catch { }
        }

        // FMT companion's own screen, inside our « FMT companion » tab.
        public System.Windows.Controls.Control Screen(PluginManager manager)
        {
            if (plugin is IWPFSettings settings)
                try { return settings.GetWPFSettingsControl(manager); } catch (Exception e) { Status = "Écran de FMT companion : " + e.Message; }
            return null;
        }

        public void End(PluginManager manager)
        {
            try { plugin?.End(manager); } catch { }
            plugin = null;
        }
    }
}

// Façade de l'API de SimHub utilisée par le plugin. Les signatures recopient celles que le compilateur a écrites dans une
// DLL compilée avec le vrai SimHub (2.2.0, sur le PC de Nathan) : mêmes noms, mêmes types, mêmes membres d'interface
// (IPlugin n'a que le « set » de PluginManager). Les corps lèvent une exception : rien ici ne s'exécute jamais.
using System;
using System.Windows.Controls;
using System.Windows.Media;
using GameReaderCommon;

namespace SimHub.Plugins
{
    [AttributeUsage(AttributeTargets.Class)]
    public class PluginNameAttribute : Attribute { public PluginNameAttribute(string name) { } }

    [AttributeUsage(AttributeTargets.Class)]
    public class PluginAuthorAttribute : Attribute { public PluginAuthorAttribute(string author) { } }

    [AttributeUsage(AttributeTargets.Class)]
    public class PluginDescriptionAttribute : Attribute { public PluginDescriptionAttribute(string description) { } }

    public interface IPlugin
    {
        PluginManager PluginManager { set; }
        void Init(PluginManager pluginManager);
        void End(PluginManager pluginManager);
    }

    public interface IDataPlugin : IPlugin
    {
        void DataUpdate(PluginManager pluginManager, ref GameData data);
    }

    public interface IWPFSettings : IPlugin
    {
        Control GetWPFSettingsControl(PluginManager pluginManager);
    }

    public interface IWPFSettingsV2 : IWPFSettings
    {
        ImageSource PictureIcon { get; }
        string LeftMenuTitle { get; }
    }

    public class PluginManager
    {
        public delegate void InputToActionTriggeredDelegate(string input, string action);

        public event InputToActionTriggeredDelegate InputToActionTriggered { add => throw Stub(); remove => throw Stub(); }

        public object GetPropertyValue(string propertyName) => throw Stub();

        public void AddAction(string actionName, Type pluginType, Action<PluginManager, string> actionStart, Action<PluginManager, string> actionEnd) => throw Stub();

        // Plugin 2.6 (profils de réglages) : le Control Mapper de SimHub. Nom du type rendu À VÉRIFIER contre une DLL compilée
        // avec le vrai SimHub (reference/simhub-api.txt le signale tant que ce n'est pas fait).
        public IControlMapperInterface GetControlMapperInterface() => throw Stub();

        internal static Exception Stub() => new NotSupportedException("Façade de compilation : SimHub charge sa propre DLL.");
    }

    public static class IPluginExtensions
    {
        public static T ReadCommonSettings<T>(this IPlugin plugin, string settingsName, Func<T> defaultValue) => throw PluginManager.Stub();

        public static void SaveCommonSettings<T>(this IPlugin plugin, string settingsName, T settings) => throw PluginManager.Stub();

        public static void AttachDelegate<TPlugin, TValue>(this TPlugin plugin, string propertyName, Func<TValue> valueProvider) where TPlugin : IPlugin => throw PluginManager.Stub();

        public static void AddAction<TPlugin>(this TPlugin plugin, string actionName, Action<PluginManager, string> actionStart, Action<PluginManager, string> actionEnd = null) where TPlugin : IPlugin => throw PluginManager.Stub();
    }

    // À VÉRIFIER (voir GetControlMapperInterface) : les deux membres que le module Profils appelle.
    public interface IControlMapperInterface
    {
        bool StartStopRole(string role, int durationMs);
        System.Collections.Generic.List<string> GetAvailableButtonRoles();
    }
}

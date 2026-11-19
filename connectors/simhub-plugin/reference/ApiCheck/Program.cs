// Usage : dotnet run -c Release -- <EnduranceManager.SimHub.dll> [--ecrire]
// Ce que la DLL du plugin attend de SimHub (types, méthodes, signatures), lu dans ses métadonnées, comparé à la liste
// vérifiée sur une DLL compilée avec le vrai SimHub (../simhub-api.txt). La façade (../SimHub.Plugins) permet de compiler
// sans SimHub ; cette vérification dit si la DLL obtenue appelle quelque chose que SimHub n'a peut-être pas, sous cette
// forme exacte. Une ligne nouvelle : à confirmer une fois avec une compilation sur le PC (puis --ecrire sur cette DLL-là).
using System;
using System.Collections.Generic;
using System.Collections.Immutable;
using System.IO;
using System.Linq;
using System.Reflection.Metadata;
using System.Reflection.PortableExecutable;

static class Program
{
    static readonly string[] SimHub = { "[SimHub.Plugins]", "[GameReaderCommon]" };

    static int Main(string[] args)
    {
        if (args.Length < 1) { Console.WriteLine("ApiCheck <dll> [--ecrire]"); return 2; }
        string list = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "simhub-api.txt"));
        if (!File.Exists(list)) list = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "..", "simhub-api.txt"));
        var lines = Shape(args[0]);
        if (args.Contains("--ecrire"))
        {
            var known = File.Exists(list) ? File.ReadAllLines(list).Where(l => l.Length > 0 && !l.StartsWith("#")).ToList() : new List<string>();
            var header = File.Exists(list) ? File.ReadAllLines(list).TakeWhile(l => l.StartsWith("#")).ToList() : new List<string>();
            File.WriteAllLines(list, header.Concat(known.Union(lines).OrderBy(x => x, StringComparer.Ordinal)));
            Console.WriteLine($"{lines.Count} lignes vérifiées dans {list}");
            return 0;
        }
        var verified = new HashSet<string>(File.ReadAllLines(list).Where(l => l.Length > 0 && !l.StartsWith("#")));
        var fresh = lines.Where(l => !verified.Contains(l)).ToList();
        Console.WriteLine($"API SimHub utilisée : {lines.Count} éléments, {lines.Count - fresh.Count} vérifiés avec le vrai SimHub.");
        foreach (var l in fresh)
            Console.WriteLine((Environment.GetEnvironmentVariable("GITHUB_ACTIONS") == "true" ? "::warning title=API SimHub à vérifier::" : "  À vérifier : ") + l);
        // Not a failure: the DLL works if SimHub has these members under this exact shape. Said in the CI's summary.
        string summary = Environment.GetEnvironmentVariable("GITHUB_STEP_SUMMARY");
        if (!string.IsNullOrEmpty(summary))
            File.AppendAllText(summary, fresh.Count == 0 ? "API SimHub : tout est vérifié avec le vrai SimHub.\n"
                : $"API SimHub : {fresh.Count} élément(s) jamais vérifié(s) avec le vrai SimHub. La DLL de la CI est à essayer avant de la donner aux pilotes :\n\n" + string.Join("\n", fresh.Select(l => "- `" + l + "`")) + "\n");
        return 0;
    }

    // The lines of the DLL's metadata that touch SimHub: references to its types and members, and our types' members
    // whose signature uses one of its types (an interface implemented must match SimHub's exactly).
    static List<string> Shape(string dll)
    {
        using var pe = new PEReader(File.OpenRead(dll));
        var md = pe.GetMetadataReader();
        var p = new Names();
        var lines = new List<string>();
        foreach (var h in md.TypeDefinitions)
        {
            var t = md.GetTypeDefinition(h);
            string tn = Names.Def(md, h);
            foreach (var i in t.GetInterfaceImplementations()) lines.Add($"impl {tn} : {Names.Any(md, md.GetInterfaceImplementation(i).Interface, p)}");
            foreach (var m in t.GetMethods())
            {
                var d = md.GetMethodDefinition(m);
                if ((d.Attributes & System.Reflection.MethodAttributes.Public) != System.Reflection.MethodAttributes.Public) continue;
                var s = d.DecodeSignature(p, null);
                lines.Add($"method {tn}::{md.GetString(d.Name)}`{s.GenericParameterCount} {s.ReturnType}({string.Join(", ", s.ParameterTypes)}) virtual={(d.Attributes & System.Reflection.MethodAttributes.Virtual) != 0}");
            }
        }
        foreach (var h in md.MemberReferences)
        {
            var m = md.GetMemberReference(h);
            string sig;
            if (m.GetKind() == MemberReferenceKind.Method) { var s = m.DecodeMethodSignature(p, null); sig = $"`{s.GenericParameterCount} {s.ReturnType}({string.Join(", ", s.ParameterTypes)})"; }
            else sig = " " + m.DecodeFieldSignature(p, null);
            lines.Add($"memberref {Names.Any(md, m.Parent, p)}::{md.GetString(m.Name)}{sig}");
        }
        foreach (var h in md.TypeReferences) lines.Add($"typeref {Names.Ref(md, h)}");
        // Only what SimHub owns: its types and members, and the members of our types that implement its interfaces.
        var plugins = new HashSet<string>(lines.Where(l => l.StartsWith("impl ") && SimHub.Any(l.Contains)).Select(l => l.Substring(5, l.IndexOf(" : ") - 5)));
        bool Owned(string l) => l.StartsWith("memberref ") ? SimHub.Any(x => l.StartsWith("memberref " + x))
            : l.StartsWith("method ") ? plugins.Any(t => l.StartsWith("method " + t + "::")) && SimHub.Any(l.Contains)
            : SimHub.Any(l.Contains);
        return lines.Where(Owned).Distinct().OrderBy(x => x, StringComparer.Ordinal).ToList();
    }

    class Names : ISignatureTypeProvider<string, object>
    {
        public static string Ref(MetadataReader r, TypeReferenceHandle h)
        {
            var t = r.GetTypeReference(h);
            string scope = t.ResolutionScope.Kind == HandleKind.AssemblyReference ? "[" + r.GetString(r.GetAssemblyReference((AssemblyReferenceHandle)t.ResolutionScope).Name) + "]"
                : t.ResolutionScope.Kind == HandleKind.TypeReference ? Ref(r, (TypeReferenceHandle)t.ResolutionScope) + "/" : "";
            string ns = r.GetString(t.Namespace);
            return scope + (ns == "" ? "" : ns + ".") + r.GetString(t.Name);
        }
        public static string Def(MetadataReader r, TypeDefinitionHandle h)
        {
            var t = r.GetTypeDefinition(h);
            string ns = r.GetString(t.Namespace);
            var dt = t.GetDeclaringType();
            return (dt.IsNil ? "" : Def(r, dt) + "/") + (ns == "" ? "" : ns + ".") + r.GetString(t.Name);
        }
        public static string Any(MetadataReader r, EntityHandle h, Names p) => h.Kind switch
        {
            HandleKind.TypeReference => Ref(r, (TypeReferenceHandle)h),
            HandleKind.TypeDefinition => Def(r, (TypeDefinitionHandle)h),
            HandleKind.TypeSpecification => r.GetTypeSpecification((TypeSpecificationHandle)h).DecodeSignature(p, null),
            _ => h.Kind.ToString()
        };
        static string K(byte k) => k == 0x11 ? "valuetype " : "";
        public string GetArrayType(string e, ArrayShape s) => e + "[,]";
        public string GetByReferenceType(string e) => "ref " + e;
        public string GetFunctionPointerType(MethodSignature<string> s) => "fnptr";
        public string GetGenericInstantiation(string g, ImmutableArray<string> a) => g + "<" + string.Join(",", a) + ">";
        public string GetGenericMethodParameter(object c, int i) => "!!" + i;
        public string GetGenericTypeParameter(object c, int i) => "!" + i;
        public string GetModifiedType(string m, string u, bool r) => u + " modreq(" + m + ")";
        public string GetPinnedType(string e) => e;
        public string GetPointerType(string e) => e + "*";
        public string GetPrimitiveType(PrimitiveTypeCode t) => t.ToString();
        public string GetSZArrayType(string e) => e + "[]";
        public string GetTypeFromDefinition(MetadataReader r, TypeDefinitionHandle h, byte k) => K(k) + Def(r, h);
        public string GetTypeFromReference(MetadataReader r, TypeReferenceHandle h, byte k) => K(k) + Ref(r, h);
        public string GetTypeFromSpecification(MetadataReader r, object c, TypeSpecificationHandle h, byte k) => "spec";
    }
}

using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Text.Json;

namespace ValtheraDB.Conduit;

class Program
{
    static void Main()
    {
        var root = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", ".."));
        var dataDir = Path.Combine(root, "csharp", "test", "data", "main");
        if (Directory.Exists(dataDir)) Directory.Delete(dataDir, true);
        Directory.CreateDirectory(dataDir);

        var arch = RuntimeInformation.OSArchitecture switch
        {
            Architecture.X64 => "x64",
            Architecture.Arm64 => "arm64",
            _ => RuntimeInformation.OSArchitecture.ToString().ToLower()
        };
        var os = RuntimeInformation.IsOSPlatform(OSPlatform.Linux) ? "linux"
               : RuntimeInformation.IsOSPlatform(OSPlatform.OSX) ? "darwin"
               : "windows";
        var bin = Path.Combine(root, "dist", $"valtheradb-conduit-{os}-{arch}");
        if (!File.Exists(bin)) bin = Path.Combine(root, "dist", "valtheradb-conduit");

        Console.WriteLine($"starting conduit from: {bin}");
        using var conduit = new Conduit(bin);
        Console.WriteLine($"ready: {conduit.Ready}");
        Console.WriteLine($"ping: {conduit.Ping()}");

        var db = conduit.Init("data", dataDir, new() { ["numberId"] = false });
        var users = db.Collection("users");

        var ada = users.Add(new() { ["name"] = "Ada", ["lang"] = "csharp" });
        var bob = users.Add(new() { ["name"] = "Bob", ["lang"] = "java" });
        Console.WriteLine($"inserted: {ada} {bob}");

        Console.WriteLine($"collections: {string.Join(", ", db.GetCollections())}");
        Console.WriteLine($"find Ada: {users.Find(new { name = "Ada" })}");
        Console.WriteLine($"find one Bob: {users.FindOne(new { name = "Bob" })}");

        var updated = users.UpdateOne(new { name = "Ada" }, new { lang = "csharp-bridge" });
        Console.WriteLine($"updated Ada: {updated}");
        Console.WriteLine($"all users: {users.Find()}");

        var removed = users.RemoveOne(new { name = "Bob" });
        Console.WriteLine($"removed Bob: {removed}");
        Console.WriteLine($"after remove: {users.Find()}");

        Console.WriteLine($"dbs: {string.Join(", ", conduit.ListDbs())}");
        conduit.Shutdown();
        Console.WriteLine("shutdown ok");
    }
}

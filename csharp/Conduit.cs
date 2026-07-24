using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace ValtheraDB.Conduit;

public class Conduit : IDisposable
{
    private const uint InitDb = 1;
    private const uint ExecuteJson = 2;
    private const uint CloseDb = 3;
    private const uint ListDbs = 4;
    private const uint Ping = 5;
    private const uint Shutdown = 6;
    private const uint Ready = 100;
    private const uint Result = 101;
    private const uint Error = 102;

    private readonly Process _process;
    private readonly Stream _stdin;
    private readonly Stream _stdout;
    private readonly ConcurrentDictionary<string, ConcurrentQueue<TaskCompletionSource<JsonElement>>> _pending = new();
    private readonly ConcurrentDictionary<string, SemaphoreSlim> _dbLocks = new();
    private readonly SemaphoreSlim _writeLock = new(1, 1);
    private readonly Task _readerTask;
    private bool _disposed;

    public JsonElement Ready { get; }

    public Conduit(string binaryPath, string? cwd = null)
    {
        var psi = new ProcessStartInfo
        {
            FileName = binaryPath,
            RedirectStandardInput = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
        };
        if (cwd != null) psi.WorkingDirectory = cwd;

        _process = Process.Start(psi) ?? throw new Exception("failed to start process");
        _stdin = _process.StandardInput.BaseStream;
        _stdout = _process.StandardOutput.BaseStream;
        _process.StandardError.BaseStream.Dispose();

        var readyFrame = Protocol.ReadFrame(_stdout);
        if (readyFrame.FrameType != Ready)
            throw new ConduitException("NOT_READY", "did not receive READY");
        Ready = readyFrame.Payload.GetProperty("result");

        _readerTask = Task.Run(ReadLoop);
    }

    public Db Db(string name) => new(this, name);

    public Db Init(string name, string dir, Dictionary<string, object>? opts = null)
    {
        var db = Db(name);
        db.Init(dir, opts);
        return db;
    }

    public JsonElement CloseDb(string name) => Request(name, CloseDb, new { });

    public List<string> ListDbs()
    {
        var result = Request("", ListDbs, new { });
        var list = new List<string>();
        if (result.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in result.EnumerateArray())
                if (item.ValueKind == JsonValueKind.String)
                    list.Add(item.GetString()!);
        }
        return list;
    }

    public JsonElement Ping() => Request("", Ping, new { });

    public JsonElement Execute(string dbName, string op, object? body = null)
    {
        var payload = new Dictionary<string, object> { ["op"] = op };
        if (body != null) payload["body"] = body;
        return Request(dbName, ExecuteJson, payload);
    }

    public void Shutdown()
    {
        if (_disposed) return;
        _disposed = true;
        try { Request("", Shutdown, new { }); } catch { }
        _stdin.Dispose();
        _process.WaitForExit(5000);
        _readerTask.Wait(5000);
    }

    public void Dispose() => Shutdown();

    internal JsonElement Request(string dbName, uint frameType, object payload)
    {
        var lockObj = _dbLocks.GetOrAdd(dbName, _ => new SemaphoreSlim(1, 1));
        lockObj.Wait();
        try
        {
            var tcs = new TaskCompletionSource<JsonElement>();
            _pending.GetOrAdd(dbName, _ => new ConcurrentQueue<TaskCompletionSource<JsonElement>>()).Enqueue(tcs);

            var data = Protocol.EncodeFrame(frameType, dbName, payload);
            _writeLock.Wait();
            try
            {
                _stdin.Write(data, 0, data.Length);
                _stdin.Flush();
            }
            finally { _writeLock.Release(); }

            if (!tcs.Task.Wait(30000))
                throw new ConduitException("TIMEOUT", "request timed out");
            return tcs.Task.Result;
        }
        finally { lockObj.Release(); }
    }

    private void ReadLoop()
    {
        try
        {
            while (true)
            {
                var frame = Protocol.ReadFrame(_stdout);
                Resolve(frame);
            }
        }
        catch
        {
            foreach (var queue in _pending.Values)
            {
                while (queue.TryDequeue(out var tcs))
                    tcs.TrySetException(new ConduitException("CLOSED", "conduit closed"));
            }
        }
    }

    private void Resolve(Frame frame)
    {
        if (!_pending.TryGetValue(frame.DbName, out var queue)) return;
        if (!queue.TryDequeue(out var tcs)) return;

        var payload = frame.Payload;
        if (frame.FrameType == Error || (payload.TryGetProperty("ok", out var ok) && ok.ValueKind == JsonValueKind.False))
        {
            var code = payload.TryGetProperty("code", out var c) ? c.GetString() ?? "ERROR" : "ERROR";
            var message = payload.TryGetProperty("message", out var m) ? m.GetString() ?? "unknown error" : "unknown error";
            var details = payload.TryGetProperty("details", out var d) ? d : default;
            tcs.TrySetException(new ConduitException(code, message, details.ValueKind != JsonValueKind.Undefined ? details : null));
        }
        else
        {
            var result = payload.TryGetProperty("result", out var r) ? r : default;
            tcs.TrySetResult(result);
        }
    }
}

public class Db
{
    private readonly Conduit _conduit;
    private readonly string _name;

    internal Db(Conduit conduit, string name)
    {
        _conduit = conduit;
        _name = name;
    }

    internal void Init(string dir, Dictionary<string, object>? opts = null)
    {
        _conduit.Request(_name, 1, new { dir, opts = opts ?? new Dictionary<string, object>() });
    }

    public JsonElement Execute(string op, object? body = null)
    {
        var payload = new Dictionary<string, object> { ["op"] = op };
        if (body != null) payload["body"] = body;
        return _conduit.Request(_name, 2, payload);
    }

    public Collection C(string name) => new(this, name);
    public Collection Collection(string name) => C(name);

    public List<string> GetCollections()
    {
        var result = Execute("getCollections");
        var list = new List<string>();
        if (result.ValueKind == JsonValueKind.Array)
            foreach (var item in result.EnumerateArray())
                if (item.ValueKind == JsonValueKind.String) list.Add(item.GetString()!);
        return list;
    }

    public bool EnsureCollection(string name) => Execute("ensureCollection", name).GetBoolean();
    public bool IssetCollection(string name) => Execute("issetCollection", name).GetBoolean();
    public bool RemoveCollection(string name) => Execute("removeCollection", name).GetBoolean();

    public JsonElement Add(object query) => Execute("add", query);
    public JsonElement Find(object? query = null) => Execute("find", query);
    public JsonElement FindOne(object query) => Execute("findOne", query);
    public JsonElement Update(object query) => Execute("update", query);
    public JsonElement UpdateOne(object query) => Execute("updateOne", query);
    public JsonElement Remove(object query) => Execute("remove", query);
    public JsonElement RemoveOne(object query) => Execute("removeOne", query);
    public JsonElement UpdateOneOrAdd(object query) => Execute("updateOneOrAdd", query);
    public JsonElement ToggleOne(object query) => Execute("toggleOne", query);

    public JsonElement Close() => _conduit.Request(_name, 3, new { });
}

public class Collection
{
    private readonly Db _db;
    private readonly string _name;

    internal Collection(Db db, string name)
    {
        _db = db;
        _name = name;
    }

    public JsonElement Add(Dictionary<string, object> data, bool idGen = true)
        => _db.Add(new { collection = _name, data, id_gen = idGen });

    public JsonElement Find(object? search = null, object? dbFindOpts = null, object? findOpts = null, object? context = null)
        => _db.Find(new { collection = _name, search = search ?? new { }, dbFindOpts = dbFindOpts ?? new { }, findOpts = findOpts ?? new { }, context = context ?? new { } });

    public JsonElement FindOne(object? search = null, object? findOpts = null, object? context = null)
        => _db.FindOne(new { collection = _name, search = search ?? new { }, findOpts = findOpts ?? new { }, context = context ?? new { } });

    public JsonElement Update(object search, object updater, object? context = null)
        => _db.Update(new { collection = _name, search, updater, context = context ?? new { } });

    public JsonElement UpdateOne(object search, object updater, object? context = null)
        => _db.UpdateOne(new { collection = _name, search, updater, context = context ?? new { } });

    public JsonElement Remove(object search, object? context = null)
        => _db.Remove(new { collection = _name, search, context = context ?? new { } });

    public JsonElement RemoveOne(object search, object? context = null)
        => _db.RemoveOne(new { collection = _name, search, context = context ?? new { } });

    public JsonElement UpdateOneOrAdd(object search, object updater, object? addArg = null, object? context = null, bool idGen = true)
        => _db.UpdateOneOrAdd(new { collection = _name, search, updater, add_arg = addArg ?? new { }, context = context ?? new { }, id_gen = idGen });

    public JsonElement ToggleOne(object search, object? data = null, object? context = null)
        => _db.ToggleOne(new { collection = _name, search, data = data ?? new { }, context = context ?? new { } });
}

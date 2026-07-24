using System;

namespace ValtheraDB.Conduit;

public class ConduitException : Exception
{
    public string Code { get; }
    public object? Details { get; }

    public ConduitException(string code, string message, object? details = null)
        : base($"[{code}] {message}")
    {
        Code = code;
        Details = details;
    }
}

using System;
using System.Buffers.Binary;
using System.IO;
using System.Text.Json;

namespace ValtheraDB.Conduit;

public class Frame
{
    public uint FrameType { get; set; }
    public string DbName { get; set; } = "";
    public JsonElement Payload { get; set; }
}

public static class Protocol
{
    public const int HeaderSize = 12;

    public static byte[] EncodeFrame(uint frameType, string dbName, object payload)
    {
        var dbNameBytes = System.Text.Encoding.UTF8.GetBytes(dbName ?? "");
        var payloadBytes = JsonSerializer.SerializeToUtf8Bytes(payload ?? new { });

        var buf = new byte[HeaderSize + dbNameBytes.Length + payloadBytes.Length];
        BinaryPrimitives.WriteUInt32LittleEndian(buf.AsSpan(0), frameType);
        BinaryPrimitives.WriteUInt32LittleEndian(buf.AsSpan(4), (uint)dbNameBytes.Length);
        BinaryPrimitives.WriteUInt32LittleEndian(buf.AsSpan(8), (uint)payloadBytes.Length);
        Buffer.BlockCopy(dbNameBytes, 0, buf, HeaderSize, dbNameBytes.Length);
        Buffer.BlockCopy(payloadBytes, 0, buf, HeaderSize + dbNameBytes.Length, payloadBytes.Length);
        return buf;
    }

    public static Frame ReadFrame(Stream stream)
    {
        var header = ReadExact(stream, HeaderSize);
        var frameType = BinaryPrimitives.ReadUInt32LittleEndian(header);
        var dbNameLen = (int)BinaryPrimitives.ReadUInt32LittleEndian(header.AsSpan(4));
        var payloadLen = (int)BinaryPrimitives.ReadUInt32LittleEndian(header.AsSpan(8));

        var dbName = "";
        if (dbNameLen > 0)
        {
            var dbNameBytes = ReadExact(stream, dbNameLen);
            dbName = System.Text.Encoding.UTF8.GetString(dbNameBytes);
        }

        JsonElement payload = default;
        if (payloadLen > 0)
        {
            var payloadBytes = ReadExact(stream, payloadLen);
            payload = JsonDocument.Parse(payloadBytes).RootElement.Clone();
        }
        else
        {
            payload = JsonDocument.Parse("{}").RootElement.Clone();
        }

        return new Frame { FrameType = frameType, DbName = dbName, Payload = payload };
    }

    private static byte[] ReadExact(Stream stream, int count)
    {
        var buf = new byte[count];
        var offset = 0;
        while (offset < count)
        {
            var n = stream.Read(buf, offset, count - offset);
            if (n <= 0) throw new EndOfStreamException("unexpected EOF");
            offset += n;
        }
        return buf;
    }
}

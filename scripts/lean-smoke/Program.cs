using System.IO.Compression;
using System.Text;
using QuantConnect;

var original = Encoding.UTF8.GetBytes("ATLAS isolated ZIP smoke: deterministic archived evidence.");
var zipped = Compression.ZipBytes(original, "atlas-evidence.txt");
if (zipped.Length == 0)
{
    throw new InvalidDataException("Compression returned an empty archive.");
}
using var archive = new ZipArchive(new MemoryStream(zipped), ZipArchiveMode.Read);
var entry = archive.GetEntry("atlas-evidence.txt")
    ?? throw new InvalidDataException("Missing ZIP entry.");
using var decoded = new MemoryStream();
using (var entryStream = entry.Open())
{
    entryStream.CopyTo(decoded);
}
if (!original.SequenceEqual(decoded.ToArray()))
{
    throw new InvalidDataException("The ZIP payload failed the byte-for-byte round trip.");
}
Console.WriteLine("LEAN INDEPENDENT COMPRESSION: PASS (ZIP payload bytes round-trip)");

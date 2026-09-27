using System;
using System.IO;
using System.Linq;
using System.Text.Json;
using QuantConnect.Data;
using QuantConnect.Algorithm;

namespace QuantConnect.Algorithm.CSharp;

public sealed class AtlasGoldenFixtureAlgorithm : QCAlgorithm
{
    private sealed record Decision(string instrument_id, string target_weight);
    private sealed record Envelope(string contract, string decision_date, string effective_date, Decision[] decisions);
    private Envelope _envelope = null!;
    private bool _applied;

    public override void Initialize()
    {
        var path = Path.Combine(Globals.DataFolder, "..", "..", "..", "atlas-golden-decision.json");
        _envelope = JsonSerializer.Deserialize<Envelope>(File.ReadAllText(path))
            ?? throw new InvalidDataException("Atlas fixture envelope is invalid.");
        if (_envelope.contract != "atlas.lean.decision.v1") throw new InvalidDataException("Unexpected contract.");
        SetStartDate(DateTime.Parse(_envelope.effective_date).Date);
        SetEndDate(DateTime.Parse(_envelope.effective_date).Date.AddDays(2));
        SetCash(100000m);
        foreach (var decision in _envelope.decisions)
            AddEquity(decision.instrument_id.Split(':').Last(), Resolution.Daily);
    }

    public override void OnData(Slice data)
    {
        if (_applied || Time.Date != DateTime.Parse(_envelope.effective_date).Date) return;
        foreach (var decision in _envelope.decisions)
        {
            var ticker = decision.instrument_id.Split(':').Last();
            var symbol = Securities.Keys.Single(x => x.Value == ticker);
            var weight = decimal.Parse(decision.target_weight, System.Globalization.CultureInfo.InvariantCulture);
            SetHoldings(symbol, weight);
            Debug($"ATLAS_FIXTURE target={decision.instrument_id} weight={weight}");
        }
        _applied = true;
    }
}

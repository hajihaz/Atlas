using Atlas.Lean.Adapter;

if (args.Length != 1)
{
    Console.Error.WriteLine("usage: Atlas.Lean.Adapter <decision.json>");
    return 2;
}

var json = File.ReadAllText(args[0]);
var envelope = DecisionEnvelopeReader.Read(json);
Console.WriteLine($"contract={envelope.Contract}");
Console.WriteLine($"strategy={envelope.StrategyConfigId}");
Console.WriteLine($"decision={envelope.DecisionDate:yyyy-MM-dd}");
Console.WriteLine($"effective={envelope.EffectiveDate:yyyy-MM-dd}");
foreach (var item in envelope.Decisions.OrderBy(x => x.InstrumentId, StringComparer.Ordinal))
    Console.WriteLine($"target={item.InstrumentId}:{item.TargetWeight}");

var algorithm = new LeanDecisionAlgorithm(envelope);
algorithm.Initialize();
algorithm.SetDateTime(envelope.EffectiveDate.ToDateTime(TimeOnly.MinValue));
foreach (var security in algorithm.Securities.Values)
    security.SetMarketPrice(new QuantConnect.Data.Market.TradeBar
    {
        Time = algorithm.Time,
        Symbol = security.Symbol,
        Open = 100m,
        High = 100m,
        Low = 100m,
        Close = 100m
    });
algorithm.OnData(new QuantConnect.Data.Slice(algorithm.Time, Array.Empty<QuantConnect.Data.BaseData>(), algorithm.Time));
Console.WriteLine("lean-algorithm-ondata=completed");
return 0;

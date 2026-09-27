using System;
using System.Linq;
using QuantConnect;
using QuantConnect.Algorithm;
using QuantConnect.Data;

namespace Atlas.Lean.Adapter;

public sealed class LeanDecisionAlgorithm : QCAlgorithm
{
    private readonly DecisionEnvelope _envelope;

    public LeanDecisionAlgorithm(DecisionEnvelope envelope)
    {
        _envelope = envelope ?? throw new ArgumentNullException(nameof(envelope));
    }

    public override void Initialize()
    {
        if (_envelope.EffectiveDate <= _envelope.DecisionDate)
            throw new InvalidOperationException("Effective date must be after decision date.");

        SetStartDate(_envelope.EffectiveDate.ToDateTime(TimeOnly.MinValue));
        SetEndDate(_envelope.EffectiveDate.AddDays(1).ToDateTime(TimeOnly.MinValue));
        SetCash(100000m);

        foreach (var decision in _envelope.Decisions)
        {
            var ticker = decision.InstrumentId.Contains(':')
                ? decision.InstrumentId.Split(':').Last()
                : decision.InstrumentId;
            AddEquity(ticker, Resolution.Daily);
        }
    }

    public override void OnData(Slice data)
    {
        if (DateOnly.FromDateTime(Time) != _envelope.EffectiveDate)
            return;

        foreach (var decision in _envelope.Decisions)
        {
            var ticker = decision.InstrumentId.Contains(':')
                ? decision.InstrumentId.Split(':').Last()
                : decision.InstrumentId;
            var symbol = Securities.Keys.Single(s => s.Value == ticker);
            var weight = decimal.Parse(decision.TargetWeight, System.Globalization.CultureInfo.InvariantCulture);
            var quantity = CalculateOrderQuantity(symbol, weight);
            if (quantity != 0)
                MarketOrder(symbol, quantity, tag: $"Atlas:{_envelope.StrategyConfigId}");
        }
    }
}

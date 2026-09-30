using QuantConnect;
using QuantConnect.Algorithm;
using QuantConnect.Data;

namespace QuantConnect.Algorithm.CSharp;

/// <summary>Atlas fixture proving an unaffordable cash-equity order is rejected by LEAN.</summary>
public sealed class AtlasCashLimitFixtureAlgorithm : QCAlgorithm
{
    private Symbol _spy = null!;
    private bool _submitted;

    public override void Initialize()
    {
        SetStartDate(2013, 10, 8);
        SetEndDate(2013, 10, 10);
        SetCash(1000m);
        _spy = AddEquity("SPY", Resolution.Daily).Symbol;
    }

    public override void OnData(Slice data)
    {
        if (_submitted || !data.Bars.ContainsKey(_spy)) return;
        _submitted = true;
        MarketOrder(_spy, 1000000);
        Debug("ATLAS_CASH_LIMIT submitted_unaffordable_order");
    }
}

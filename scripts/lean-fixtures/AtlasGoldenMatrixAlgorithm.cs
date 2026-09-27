using System;
using QuantConnect;
using QuantConnect.Algorithm;
using QuantConnect.Data;

namespace QuantConnect.Algorithm.CSharp;

/// <summary>
/// Deterministic Atlas cross-engine fixture covering multi-asset allocation,
/// rebalancing, and a sell-to-zero path. It is test infrastructure only.
/// </summary>
public sealed class AtlasGoldenMatrixAlgorithm : QCAlgorithm
{
    private Symbol _spy = null!;
    private Symbol _aapl = null!;
    private int _session;

    public override void Initialize()
    {
        SetStartDate(2013, 10, 8);
        SetEndDate(2013, 10, 14);
        SetCash(100000m);
        _spy = AddEquity("SPY", Resolution.Daily).Symbol;
        _aapl = AddEquity("AAPL", Resolution.Daily).Symbol;
    }

    public override void OnData(Slice data)
    {
        if (!data.Bars.ContainsKey(_spy) || !data.Bars.ContainsKey(_aapl)) return;
        _session++;
        if (_session == 1)
        {
            SetHoldings(_spy, 0.50m);
            SetHoldings(_aapl, 0.25m);
            Debug("ATLAS_MATRIX stage=initial");
        }
        else if (_session == 2)
        {
            SetHoldings(_spy, 0.25m);
            SetHoldings(_aapl, 0.50m);
            Debug("ATLAS_MATRIX stage=rebalance");
        }
        else if (_session == 3)
        {
            Liquidate(_aapl);
            Debug("ATLAS_MATRIX stage=sell_to_zero");
        }
    }
}

using QuantConnect;
using QuantConnect.Algorithm;
using QuantConnect.Data;
using QuantConnect.Orders;

namespace QuantConnect.Algorithm.CSharp;

/// <summary>
/// Offline LEAN proof of a limit order update and subsequent cancellation with zero fills.
/// </summary>
public sealed class AtlasLimitReplaceFixtureAlgorithm : QCAlgorithm
{
    private Symbol _spy = null!;
    private OrderTicket? _ticket;
    private int _sessions;

    public override void Initialize()
    {
        SetStartDate(2013, 10, 8);
        SetEndDate(2013, 10, 18);
        SetCash(100000m);
        _spy = AddEquity("SPY", Resolution.Daily).Symbol;
    }

    public override void OnData(Slice data)
    {
        if (!data.Bars.ContainsKey(_spy)) return;
        _sessions++;
        if (_sessions == 1)
            _ticket = LimitOrder(_spy, 5, 0.01m, tag: "ATLAS-unreachable-limit");
        else if (_sessions == 2 && _ticket != null)
            _ticket.Update(new UpdateOrderFields { LimitPrice = 0.02m, Tag = "ATLAS-updated-unreachable-limit" });
        else if (_sessions == 3 && _ticket != null)
            _ticket.Cancel("ATLAS deterministic final cancellation");
    }
}

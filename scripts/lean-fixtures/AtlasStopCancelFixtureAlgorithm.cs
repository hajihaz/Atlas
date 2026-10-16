using QuantConnect;
using QuantConnect.Algorithm;
using QuantConnect.Data;
using QuantConnect.Orders;

namespace QuantConnect.Algorithm.CSharp;

/// <summary>
/// Deterministic zero-fill stop-market cancellation on archived daily bars.
/// The stop is deliberately unreachable; no broker or network egress exists.
/// </summary>
public sealed class AtlasStopCancelFixtureAlgorithm : QCAlgorithm
{
    private Symbol _spy = null!;
    private OrderTicket? _ticket;
    private int _sessions;

    public override void Initialize()
    {
        SetStartDate(2013, 10, 8);
        SetEndDate(2013, 10, 14);
        SetCash(100000m);
        _spy = AddEquity("SPY", Resolution.Daily).Symbol;
    }

    public override void OnData(Slice data)
    {
        if (!data.Bars.ContainsKey(_spy)) return;
        _sessions++;
        if (_sessions == 1)
        {
            _ticket = StopMarketOrder(_spy, 5, 999999m, tag: "ATLAS-unreachable-stop");
        }
        else if (_sessions == 2 && _ticket != null)
        {
            _ticket.Cancel("ATLAS deterministic stop cancellation");
        }
    }
}

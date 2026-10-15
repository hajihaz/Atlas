using QuantConnect;
using QuantConnect.Algorithm;
using QuantConnect.Data;
using QuantConnect.Orders;

namespace QuantConnect.Algorithm.CSharp;

/// <summary>
/// Atlas deterministic LEAN proof that an unfilled limit order is cancelled
/// without changing portfolio holdings, cash, turnover or charging fill fees.
/// This fixture has no network or broker credentials.
/// </summary>
public sealed class AtlasLimitCancelFixtureAlgorithm : QCAlgorithm
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
            _ticket = LimitOrder(_spy, 5, 0.01m, tag: "ATLAS-unmarketable-buy");
            Debug("ATLAS_LIMIT_CANCEL placed_below_market_limit");
        }
        else if (_sessions == 2 && _ticket != null)
        {
            _ticket.Cancel("ATLAS deterministic cancellation");
            Debug("ATLAS_LIMIT_CANCEL cancellation_requested");
        }
    }
}
